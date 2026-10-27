import fs from "fs";
import os from "os";
import path from "path";
import { generateTestDatabaseName, setupTestDatabase } from "@ts-safeql/test-utils";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TsxFileMigrationProvider, loadKyselyMigration, migrate } from "./migrate";

describe("TsxFileMigrationProvider", () => {
  let dir: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "safeql-kysely-mig-"));

    const migrationsWrittenOutOfOrder = ["0002_second.ts", "0001_first.ts"];
    for (const file of migrationsWrittenOutOfOrder) {
      fs.writeFileSync(
        path.join(dir, file),
        "export async function up() {}\nexport async function down() {}\n",
      );
    }
    fs.writeFileSync(path.join(dir, "types.d.ts"), "export type X = number;\n");
    fs.writeFileSync(path.join(dir, "README.md"), "# not a migration\n");
  });

  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("reads migrations in alpha-numeric order, ignoring non-migration files", async () => {
    const provider = new TsxFileMigrationProvider(dir);
    const migrations = await provider.getMigrations();

    expect(Object.keys(migrations)).toEqual(["0001_first", "0002_second"]);
  });

  it("loads TypeScript migrations (which `import()` can't) with callable `up`/`down`", async () => {
    const provider = new TsxFileMigrationProvider(dir);
    const migrations = await provider.getMigrations();

    expect(typeof migrations["0001_first"].up).toBe("function");
    expect(typeof migrations["0001_first"].down).toBe("function");
  });

  it("loads migrations from a folder given relative to the working directory", async () => {
    const provider = new TsxFileMigrationProvider(path.relative(process.cwd(), dir));
    const migrations = await provider.getMigrations();

    expect(Object.keys(migrations)).toEqual(["0001_first", "0002_second"]);
  });

  it("returns an empty set for a directory with no migrations", async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "safeql-kysely-empty-"));
    try {
      const provider = new TsxFileMigrationProvider(empty);
      expect(await provider.getMigrations()).toEqual({});
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe("loadKyselyMigration", () => {
  class Migrator {}
  class LegacyMigrator {}

  it("loads the migrator from kysely/migration (Kysely 0.29+)", async () => {
    const modules: Record<string, unknown> = {
      "kysely/migration": { Migrator },
      kysely: { Migrator: LegacyMigrator },
    };

    const { Migrator: loaded } = await loadKyselyMigration(async (specifier) => modules[specifier]);

    expect(loaded).toBe(Migrator);
  });

  it("falls back to the kysely root export when kysely/migration is missing (Kysely 0.27, 0.28)", async () => {
    const { Migrator: loaded } = await loadKyselyMigration(async (specifier) => {
      if (specifier === "kysely/migration") throw new Error("Cannot find module");
      return { Migrator: LegacyMigrator };
    });

    expect(loaded).toBe(LegacyMigrator);
  });
});

describe("migrate", () => {
  const applicationName = "safeql_kysely_migrate_test";
  let sql!: Sql;
  let databaseUrl!: string;
  let dropDatabase!: () => Promise<unknown>;
  let migrationsDir: string;

  beforeAll(async () => {
    const testDatabase = await setupTestDatabase({
      databaseName: generateTestDatabaseName(),
      postgresUrl: "postgres://postgres:postgres@localhost:5432/postgres",
    });
    sql = testDatabase.sql;
    databaseUrl = `${testDatabase.databaseUrl}?application_name=${applicationName}`;
    dropDatabase = testDatabase.drop;
    migrationsDir = fs.mkdtempSync(path.join(os.tmpdir(), "safeql-kysely-migrate-"));
  });

  afterAll(async () => {
    fs.rmSync(migrationsDir, { recursive: true, force: true });
    await sql.end();
    await dropDatabase();
  });

  const runMigrations = () =>
    migrate({ databaseUrl, sql, migrationsDir, projectDir: process.cwd() });

  const openMigrationConnections = async () => {
    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count from pg_stat_activity where application_name = ${applicationName}
    `;
    return count;
  };

  it("closes its connections after migrating", async () => {
    fs.writeFileSync(
      path.join(migrationsDir, "0001_create.ts"),
      `export async function up(db) { await db.schema.createTable("person").addColumn("id", "integer").execute(); }\n`,
    );

    await runMigrations();

    expect(await sql`select to_regclass('person') as person`).toEqual([{ person: "person" }]);
    await expect.poll(openMigrationConnections).toBe(0);
  });

  it("closes its connections when a migration fails", async () => {
    fs.writeFileSync(
      path.join(migrationsDir, "0002_fail.ts"),
      `export async function up() { throw new Error("boom"); }\n`,
    );

    await expect(runMigrations()).rejects.toThrow('Kysely migration failed (in "0002_fail"): boom');

    await expect.poll(openMigrationConnections).toBe(0);
  });
});
