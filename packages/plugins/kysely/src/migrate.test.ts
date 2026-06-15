import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TsxFileMigrationProvider } from "./migrate";

describe("TsxFileMigrationProvider", () => {
  let dir: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "safeql-kysely-mig-"));

    // Intentionally written out of order to prove alpha-numeric sorting.
    fs.writeFileSync(
      path.join(dir, "0002_second.ts"),
      "export async function up() {}\nexport async function down() {}\n",
    );
    fs.writeFileSync(
      path.join(dir, "0001_first.ts"),
      "export async function up() {}\nexport async function down() {}\n",
    );
    // Non-migration files must be ignored.
    fs.writeFileSync(path.join(dir, "types.d.ts"), "export type X = number;\n");
    fs.writeFileSync(path.join(dir, "README.md"), "# not a migration\n");
  });

  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("reads migrations in alpha-numeric order, ignoring non-migration files", async () => {
    const provider = new TsxFileMigrationProvider(dir);
    const migrations = await provider.getMigrations();

    expect(Object.keys(migrations)).toEqual(["0001_first", "0002_second"]);
  });

  it("loads `up`/`down` as callable functions", async () => {
    const provider = new TsxFileMigrationProvider(dir);
    const migrations = await provider.getMigrations();

    expect(typeof migrations["0001_first"].up).toBe("function");
    expect(typeof migrations["0001_first"].down).toBe("function");
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
