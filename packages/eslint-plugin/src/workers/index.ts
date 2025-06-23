import path from "path";
import { AnyAsyncFn, createSyncFn } from "synckit";
import { distDir } from "../dirs";
import { CheckSQLWorkerHandler } from "./check-sql.worker";

function defineWorker<T extends AnyAsyncFn<R>, R = unknown>(params: {
  name: string;
  timeout: number;
}) {
  return createSyncFn<T>(path.join(distDir, "workers", `${params.name}.worker.mjs`), {
    tsRunner: "tsx",
    timeout: params.timeout,
  });
}

export const workers = {
  generateSync: defineWorker<CheckSQLWorkerHandler>({ name: "check-sql", timeout: 1000 * 60 * 5 }),
};
