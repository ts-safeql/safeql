import { generateTestDatabaseName, setupTestDatabase } from "@ts-safeql/test-utils";
import type { TestProject } from "vitest/node";
import { CHECK_SQL_POSTGRES_URL, runCheckSqlMigrations } from "./check-sql.migrations";

export default async function setup({ provide }: TestProject) {
  const testDatabase = await setupTestDatabase({
    databaseName: generateTestDatabaseName(),
    postgresUrl: CHECK_SQL_POSTGRES_URL,
  });

  try {
    await runCheckSqlMigrations(testDatabase.sql);
  } catch (error) {
    await testDatabase.sql.end();
    await testDatabase.drop();
    throw error;
  }
  await testDatabase.sql.end();

  provide("checkSqlDatabaseUrl", testDatabase.databaseUrl);

  return async () => {
    await testDatabase.drop();
  };
}
