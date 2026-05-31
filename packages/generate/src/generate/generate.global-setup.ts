import { generateTestDatabaseName, setupTestDatabase } from "@ts-safeql/test-utils";
import type { TestProject } from "vitest/node";
import { GENERATE_POSTGRES_URL, runMigrations } from "./generate.migrations";

export default async function setup({ provide }: TestProject) {
  const testDatabase = await setupTestDatabase({
    databaseName: generateTestDatabaseName(),
    postgresUrl: GENERATE_POSTGRES_URL,
  });

  try {
    await runMigrations(testDatabase.sql);
  } catch (error) {
    await testDatabase.sql.end();
    await testDatabase.drop();
    throw error;
  }
  await testDatabase.sql.end();

  provide("generateDatabaseUrl", testDatabase.databaseUrl);

  return async () => {
    await testDatabase.drop();
  };
}
