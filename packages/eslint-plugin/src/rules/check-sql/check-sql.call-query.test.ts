import { normalizeIndent } from "@ts-safeql/shared";
import path from "path";
import { checkSqlRule, ruleTester, setupCheckSqlRuleTester } from "./check-sql.test-utils";

const { withConnection, connections } = setupCheckSqlRuleTester();

const callQueryPlugin = {
  package: path.resolve(__dirname, "../ts-fixture/call-query-plugin.ts"),
  config: {},
};

function options(overrides: Partial<Parameters<typeof withConnection>[0]> = {}) {
  return withConnection({
    ...connections.base,
    keepAlive: false,
    targets: [],
    plugins: [callQueryPlugin],
    ...overrides,
  });
}

ruleTester.run("call expression plugin query", checkSqlRule, {
  valid: [
    {
      options: options({ enforceType: "suggest" }),
      code: normalizeIndent`
        declare const db: {
          execute<T>(): Promise<T>;
        };

        db.execute<{ one: number }>();
      `,
    },
    {
      name: "non-terminal methods are ignored even when query plugin is present",
      options: options(),
      code: normalizeIndent`
        declare const db: {
          execute<T>(): Promise<T>;
          notATerminalMethod<T>(): Promise<T>;
        };

        db.notATerminalMethod();
      `,
    },
    {
      options: options(),
      code: normalizeIndent`
        declare const db: {
          compile<T>(): { sql: string };
          execute<T>(): Promise<T>;
          executeTakeFirst<T>(): Promise<T>;
          executeTakeFirstOrThrow<T>(): Promise<T>;
          stream<T>(): AsyncIterable<T>;
        };

        db.compile<{ one: number }>();
        db.execute<{ one: number }>();
        db.executeTakeFirst<{ one: number }>();
        db.executeTakeFirstOrThrow<{ one: number }>();
        db.stream<{ one: number }>();
      `,
    },
  ],
  invalid: [
    {
      options: options(),
      code: normalizeIndent`
        declare const db: {
          execute<T>(): Promise<T>;
        };

        db.execute();
      `,
      output: normalizeIndent`
        declare const db: {
          execute<T>(): Promise<T>;
        };

        db.execute<{ one: number }>();
      `,
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
    {
      options: options({ enforceType: "suggest" }),
      code: normalizeIndent`
        declare const db: {
          execute<T>(): Promise<T>;
        };

        db.execute();
      `,
      errors: [
        {
          messageId: "missingTypeAnnotations",
          suggestions: [
            {
              messageId: "missingTypeAnnotations",
              output: normalizeIndent`
                declare const db: {
                  execute<T>(): Promise<T>;
                };

                db.execute<{ one: number }>();
              `,
            },
          ],
        },
      ],
    },
    {
      options: options(),
      code: normalizeIndent`
        declare const db: {
          query: {
            execute<T>(): Promise<T>;
          };
        };

        db.query.execute();
      `,
      output: normalizeIndent`
        declare const db: {
          query: {
            execute<T>(): Promise<T>;
          };
        };

        db.query.execute<{ one: number }>();
      `,
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
    {
      options: options({ enforceType: "suggest" }),
      code: normalizeIndent`
        declare const db: {
          execute<T>(): Promise<T>;
        };

        db.execute<{ one: string }>();
      `,
      errors: [
        {
          messageId: "incorrectTypeAnnotations",
          suggestions: [
            {
              messageId: "incorrectTypeAnnotations",
              output: normalizeIndent`
                declare const db: {
                  execute<T>(): Promise<T>;
                };

                db.execute<{ one: number }>();
              `,
            },
          ],
        },
      ],
    },
    {
      options: options(),
      code: normalizeIndent`
        declare const db: {
          executeTakeFirst<T>(): Promise<T>;
          executeTakeFirstOrThrow<T>(): Promise<T>;
        };

        db.executeTakeFirst();
        db.executeTakeFirstOrThrow();
      `,
      output: normalizeIndent`
        declare const db: {
          executeTakeFirst<T>(): Promise<T>;
          executeTakeFirstOrThrow<T>(): Promise<T>;
        };

        db.executeTakeFirst<{ one: number }>();
        db.executeTakeFirstOrThrow<{ one: number }>();
      `,
      errors: [{ messageId: "missingTypeAnnotations" }, { messageId: "missingTypeAnnotations" }],
    },
  ],
});
