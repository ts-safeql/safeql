import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { handler } from "./check-sql.worker";

describe("check-sql worker", () => {
  let tempDir: string;
  let pluginPath: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "safeql-worker-plugin-"));
    pluginPath = path.join(tempDir, "worker-hook-plugin.ts");
    fs.writeFileSync(
      pluginPath,
      String.raw`
import postgres from "postgres";

export default {
  factory(config: { databaseUrl: string }) {
    return {
      name: "safeql-worker-rule-only-hook-guard",
      createConnection: {
        cacheKey: "safeql-worker-rule-only-hook-guard://" + config.databaseUrl,
        async handler() {
          return postgres(config.databaseUrl);
        },
      },
      resolveQuery() {
        throw new Error("resolveQuery must not be called in worker path");
      },
      resolveSchemaType() {
        throw new Error("resolveSchemaType must not be called in worker path");
      },
    };
  },
};
`,
    );
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("ignores rule-only plugin hooks while executing worker validation", async () => {
    const result = await handler({
      connection: {
        keepAlive: false,
        plugins: [
          {
            package: pluginPath,
            config: {
              databaseUrl: inject("checkSqlDatabaseUrl"),
            },
          },
        ],
      },
      target: { tag: "sql" },
      query: {
        text: "SELECT 1 AS one",
        sourcemaps: [],
      },
      projectDir: tempDir,
    });

    const payload =
      typeof result === "string"
        ? (JSON.parse(result) as {
            _tag: "Right" | "Left";
            right?: unknown;
            left?: unknown;
          })
        : (result as {
            _tag: "Right" | "Left";
            right?: unknown;
            left?: unknown;
          });

    expect(payload).toMatchObject({ _tag: "Right" });

    const workerResult =
      typeof payload.right === "string"
        ? (JSON.parse(payload.right) as { right: unknown })
        : payload;
    const generateResult =
      "right" in workerResult ? (workerResult.right as { query: { text: string } }) : undefined;

    expect(generateResult?.query.text).toBe("SELECT 1 AS one");
  });
});
