import postgres from "postgres";
import { afterAll, inject } from "vitest";
import { createTestQuery } from "../test-utils";

declare module "vitest" {
  interface ProvidedContext {
    generateDatabaseUrl: string;
  }
}

export function setupGenerateTest() {
  const sql = postgres(inject("generateDatabaseUrl"));
  afterAll(() => sql.end());
  return createTestQuery(sql);
}
