import path from "path";
import { AnyFn, createSyncFn } from "synckit";
import { CheckSQLWorkerHandler } from "./check-sql.worker";
import { ParseSyncWorkerHandler } from "./parse-sync.worker";
import { fileURLToPath } from "node:url";

export const distDir = fileURLToPath(new URL("../../dist", import.meta.url));

function defineWorker<T extends AnyFn<R>, R = unknown>(params: { name: string; timeout: number }) {
  return createSyncFn<T>(path.join(distDir, `./workers/${params.name}.worker.mjs`), {
    tsRunner: "tsx",
    timeout: params.timeout,
  });
}

export const workers = {
  generateSync: defineWorker<CheckSQLWorkerHandler>({ name: "check-sql", timeout: 1000 * 60 * 5 }),
  parseSync: defineWorker<ParseSyncWorkerHandler>({ name: "parse-sync", timeout: 1000 * 5 }),
};
