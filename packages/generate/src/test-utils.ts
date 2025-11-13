import { InternalError, isPostgresError } from "@ts-safeql/shared";
import assert from "assert";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import { flow, identity, pipe } from "fp-ts/lib/function";
import { Sql } from "postgres";
import { createGenerator, GenerateParams, ResolvedTargetEntry } from "./generate";

export type SQL = Sql<Record<string, unknown>>;

export function createTestQuery(sql: SQL) {
  const { generate } = createGenerator();
  const generateTE = flow(
    generate,
    TE.tryCatchK(identity, (e) => (isPostgresError(e) ? e : InternalError.to(e))),
  );

  return async (params: {
    query: string;
    expected?: ResolvedTargetEntry[] | null;
    expectedError?: string;
    options?: Partial<GenerateParams>;
    unknownColumns?: string[];
    schema?: string;
    overrides?: GenerateParams["overrides"];
  }) => {
    const { query } = params;
    const cacheKey = "test";

    const run = (sql: Sql) =>
      pipe(
        TE.Do,
        TE.bind("result", () =>
          generateTE({
            sql,
            query: { text: query, sourcemaps: [] },
            cacheKey,
            fieldTransform: undefined,
            overrides: params.overrides ?? {
              columns: {
                "employee.data": "Data[]",
              },
              types: {
                overriden_enum: "OverridenEnum",
                overriden_domain: "OverridenDomain",
              },
            },
            cacheMetadata: params.schema === undefined && params.options?.overrides === undefined,
            ...params.options,
          }),
        ),
        TE.chainW(({ result }) => TE.fromEither(result)),
        TE.match(
          (error) =>
            pipe(
              params.expectedError,
              O.fromNullable,
              O.fold(
                () => assert.fail(error.stack),
                (expectedError) => assert.strictEqual(error.message, expectedError),
              ),
            ),
          ({ output, unknownColumns }) => {
            assert.deepEqual(output?.value ?? null, params.expected);
            assert.deepEqual(params.expectedError, undefined);

            if (unknownColumns.length > 0 || params.unknownColumns) {
              assert.deepEqual(unknownColumns, params.unknownColumns);
            }
          },
        ),
      )();

    const reserved = await sql.reserve();
    try {
      await reserved.unsafe("begin");
      if (params.schema) await reserved.unsafe(params.schema);
      await run(reserved);
    } finally {
      await reserved.unsafe("rollback");
      await reserved.release();
    }
  };
}
