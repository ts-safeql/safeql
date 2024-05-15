import parser from "libpg-query";
import { runAsWorker } from "synckit";
import { ParseResult } from "@ts-safeql/sql-ast";

async function workerHandler(params: { query: string }): Promise<ParseResult> {
  const x = await parser.parseQuery(params.query);
  return x;
}

export type ParseSyncWorkerHandler = typeof workerHandler;

runAsWorker(workerHandler);
