import { generateTestDatabaseName, setupTestDatabase } from "@ts-safeql/test-utils";
import type { TestProject } from "vitest/node";
import { CHECK_SQL_POSTGRES_URL, runCheckSqlMigrations } from "./check-sql.migrations";

export default async function setup({ provide }: TestProject) {
  const databaseName = generateTestDatabaseName();
  const testDatabase = await setupTestDatabase({
    databaseName: databaseName,
    postgresUrl: CHECK_SQL_POSTGRES_URL,
  });

  await runCheckSqlMigrations(testDatabase.sql);
  await testDatabase.sql.end();

  provide("checkSqlDatabaseName", databaseName);

  return async () => {
    await testDatabase.drop();
  };
}
