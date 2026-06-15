import { createRequire } from "module";
import fs from "fs";
import path from "path";
import type { MigrateContext } from "@ts-safeql/plugin-utils";
import type { Migration, MigrationProvider } from "kysely";

const MIGRATION_FILE = /\.(?:m|c)?[jt]s$/;
const DECLARATION_FILE = /\.d\.(?:m|c)?ts$/;

/**
 * A Kysely {@link MigrationProvider} that loads migration files (including
 * TypeScript) via `tsx`, so SafeQL can run TS migrations inside its worker
 * without a separate build step. Kysely's built-in `FileMigrationProvider`
 * uses plain `import()`, which cannot load `.ts` files at runtime.
 */
export class TsxFileMigrationProvider implements MigrationProvider {
  constructor(private readonly migrationFolder: string) {}

  async getMigrations(): Promise<Record<string, Migration>> {
    // Resolve to an absolute path: `tsx.require` needs one, and the folder may
    // arrive relative (e.g. when the linted file path is relative).
    const folder = path.resolve(this.migrationFolder);

    if (!fs.existsSync(folder)) {
      return {};
    }

    const files = fs
      .readdirSync(folder)
      .filter((file) => MIGRATION_FILE.test(file) && !DECLARATION_FILE.test(file))
      .sort();

    const migrations: Record<string, Migration> = {};

    for (const file of files) {
      const fullPath = path.join(folder, file);
      const name = file.replace(MIGRATION_FILE, "");
      if (name in migrations) {
        throw new Error(
          `Duplicate Kysely migration name "${name}" (e.g. two files differing only by extension). Migration names must be unique.`,
        );
      }
      const mod = loadModule(fullPath);
      migrations[name] = { up: mod.up, down: mod.down };
    }

    return migrations;
  }
}

interface MigrationModule {
  up: Migration["up"];
  down?: Migration["down"];
}

function loadModule(absolutePath: string): MigrationModule {
  const tsx = loadTsx();
  const mod = tsx.require(absolutePath, import.meta.url);
  const resolved = (mod as { default?: unknown }).default ?? mod;

  if (
    typeof resolved !== "object" ||
    resolved === null ||
    typeof (resolved as { up?: unknown }).up !== "function" ||
    ((resolved as { down?: unknown }).down !== undefined &&
      typeof (resolved as { down?: unknown }).down !== "function")
  ) {
    throw new Error(
      `Kysely migration "${absolutePath}" must export an \`up\` function (\`down\` is optional).`,
    );
  }

  return resolved as MigrationModule;
}

function loadTsx(): { require: (id: string, fromFile: string) => unknown } {
  try {
    return createRequire(import.meta.url)("tsx/cjs/api") as {
      require: (id: string, fromFile: string) => unknown;
    };
  } catch (cause) {
    throw new Error(
      'SafeQL could not load "tsx", which is required to run Kysely TypeScript migrations. ' +
        "Install it in your project (e.g. `npm i -D tsx`).",
      { cause },
    );
  }
}

/**
 * Apply Kysely migrations to the freshly-created shadow database. Wired into
 * SafeQL via the plugin's `migrate` hook.
 */
export async function migrate({ databaseUrl, migrationsDir }: MigrateContext): Promise<void> {
  const { Kysely, Migrator, PostgresDialect } = await loadKysely();
  const { Pool } = await loadPg();

  const pool = new Pool({ connectionString: databaseUrl });
  const db = new Kysely<unknown>({ dialect: new PostgresDialect({ pool }) });

  try {
    const migrator = new Migrator({
      db,
      provider: new TsxFileMigrationProvider(migrationsDir),
    });

    const { error, results } = await migrator.migrateToLatest();

    if (error !== undefined) {
      const failed = results?.find((result) => result.status === "Error");
      const where = failed ? ` (in "${failed.migrationName}")` : "";
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Kysely migration failed${where}: ${reason}`);
    }
  } finally {
    await db.destroy();
  }
}

async function loadKysely(): Promise<typeof import("kysely")> {
  try {
    return await import("kysely");
  } catch (cause) {
    throw new Error(
      'SafeQL could not load "kysely". Install it in your project to run Kysely migrations.',
      { cause },
    );
  }
}

async function loadPg(): Promise<typeof import("pg")> {
  try {
    return await import("pg");
  } catch (cause) {
    throw new Error(
      'SafeQL could not load "pg". Install it in your project to run Kysely migrations.',
      { cause },
    );
  }
}
