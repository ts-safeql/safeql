import { describe, expect, it } from "vitest";
import { getDatabaseName } from "./check-sql.utils";

describe("getDatabaseName", () => {
  it("returns an explicit database name unchanged", () => {
    expect(
      getDatabaseName({
        databaseName: "custom",
        migrationsDir: "./migrations",
        projectDir: "/tmp/app",
      }),
    ).toBe("custom");
  });

  it("derives a PostgreSQL-safe name from a POSIX project path", () => {
    const name = getDatabaseName({
      databaseName: undefined,
      migrationsDir: "./migrations",
      projectDir: "/tmp/My App[1]",
    });

    expect(name).toMatch(/^safeql_my_app_1__[0-9a-f]{8}$/);
  });

  it("derives a PostgreSQL-safe name from a Windows project path", () => {
    const name = getDatabaseName({
      databaseName: undefined,
      migrationsDir: "./migrations",
      projectDir: "C:\\Users\\me\\My App[1]",
    });

    expect(name).toMatch(/^safeql_my_app_1__[0-9a-f]{8}$/);
  });

  it("replaces characters that are invalid in PostgreSQL identifiers", () => {
    const name = getDatabaseName({
      databaseName: undefined,
      migrationsDir: "./migrations",
      projectDir: "/tmp/app[1]^_`",
    });

    expect(name).toMatch(/^safeql_[a-z0-9_]+_[0-9a-f]{8}$/);
    expect(name).not.toMatch(/[\\[\]^`]/);
  });
});
