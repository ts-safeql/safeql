import path from "path";
import { AnyFn, createSyncFn } from "synckit";
import { CheckSQLWorkerHandler } from "./check-sql.worker";
import { fileURLToPath } from "node:url";

export const distDir = fileURLToPath(new URL("../../dist", import.meta.url));

/**
 * Creates a synchronous worker function for the specified worker script.
 *
 * @param params - Object containing the worker script name and timeout in milliseconds
 * @returns A synchronous function that executes the worker script with the given configuration
 */
function defineWorker<T extends AnyFn<R>, R = unknown>(params: { name: string; timeout: number }) {
  return createSyncFn<T>(path.join(distDir, `./workers/${params.name}.worker.mjs`), {
    tsRunner: "tsx",
    timeout: params.timeout,
  });
}

export const workers = {
  generateSync: defineWorker<CheckSQLWorkerHandler>({ name: "check-sql", timeout: 1000 * 60 * 5 }),
};
