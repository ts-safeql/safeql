import { normalizeIndent } from "@ts-safeql/shared";
import path from "path";
import { checkSqlRule, ruleTester, setupCheckSqlRuleTester } from "./check-sql.test-utils";

const { withConnection, connections } = setupCheckSqlRuleTester();

const callQueryPlugin = {
  package: path.resolve(__dirname, "../ts-fixture/call-query-plugin.ts"),
  config: {},
};

const callQueryCustomMethodPlugin = {
  package: path.resolve(__dirname, "../ts-fixture/call-query-custom-method-plugin.ts"),
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
          run<T>(): Promise<T>;
        };

        db.run<{ one: number }>();
      `,
    },
    {
      name: "non-terminal methods are ignored even when query plugin is present",
      options: options(),
      code: normalizeIndent`
        declare const db: {
          run<T>(): Promise<T>;
          notATerminalMethod<T>(): Promise<T>;
        };

        db.notATerminalMethod();
      `,
    },
    {
      options: options(),
      code: normalizeIndent`
        declare const db: {
          prepare<T>(): { sql: string };
          run<T>(): Promise<T>;
          get<T>(): Promise<T>;
          getOrThrow<T>(): Promise<T>;
          iterate<T>(): AsyncIterable<T>;
        };

        db.prepare<{ one: number }>();
        db.run<{ one: number }>();
        db.get<{ one: number }>();
        db.getOrThrow<{ one: number }>();
        db.iterate<{ one: number }>();
      `,
    },
  ],
  invalid: [
    {
      options: options(),
      code: normalizeIndent`
        declare const db: {
          run<T>(): Promise<T>;
        };

        db.run();
      `,
      output: normalizeIndent`
        declare const db: {
          run<T>(): Promise<T>;
        };

        db.run<{ one: number }>();
      `,
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
    {
      options: options({ enforceType: "suggest" }),
      code: normalizeIndent`
        declare const db: {
          run<T>(): Promise<T>;
        };

        db.run();
      `,
      errors: [
        {
          messageId: "missingTypeAnnotations",
          suggestions: [
            {
              messageId: "missingTypeAnnotations",
              output: normalizeIndent`
                declare const db: {
                  run<T>(): Promise<T>;
                };

                db.run<{ one: number }>();
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
            run<T>(): Promise<T>;
          };
        };

        db.query.run();
      `,
      output: normalizeIndent`
        declare const db: {
          query: {
            run<T>(): Promise<T>;
          };
        };

        db.query.run<{ one: number }>();
      `,
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
    {
      options: options({ enforceType: "suggest" }),
      code: normalizeIndent`
        declare const db: {
          run<T>(): Promise<T>;
        };

        db.run<{ one: string }>();
      `,
      errors: [
        {
          messageId: "incorrectTypeAnnotations",
          suggestions: [
            {
              messageId: "incorrectTypeAnnotations",
              output: normalizeIndent`
                declare const db: {
                  run<T>(): Promise<T>;
                };

                db.run<{ one: number }>();
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
          get<T>(): Promise<T>;
          getOrThrow<T>(): Promise<T>;
        };

        db.get();
        db.getOrThrow();
      `,
      output: normalizeIndent`
        declare const db: {
          get<T>(): Promise<T>;
          getOrThrow<T>(): Promise<T>;
        };

        db.get<{ one: number }>();
        db.getOrThrow<{ one: number }>();
      `,
      errors: [{ messageId: "missingTypeAnnotations" }, { messageId: "missingTypeAnnotations" }],
    },
  ],
});

ruleTester.run("call expression plugin with a custom method name", checkSqlRule, {
  valid: [
    {
      options: withConnection({
        ...connections.base,
        keepAlive: false,
        targets: [],
        plugins: [callQueryCustomMethodPlugin],
      }),
      code: normalizeIndent`
        declare const db: {
          runRawQuery<T>(): Promise<T>;
        };

        db.runRawQuery<{ one: number }>();
      `,
    },
  ],
  invalid: [
    {
      options: withConnection({
        ...connections.base,
        keepAlive: false,
        targets: [],
        plugins: [callQueryCustomMethodPlugin],
      }),
      code: normalizeIndent`
        declare const db: {
          runRawQuery<T>(): Promise<T>;
        };

        db.runRawQuery();
      `,
      output: normalizeIndent`
        declare const db: {
          runRawQuery<T>(): Promise<T>;
        };

        db.runRawQuery<{ one: number }>();
      `,
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
  ],
});

// A builder query has no tag, so it must still be validated when the connection also declares
// tag `targets` (otherwise builder calls would be silently skipped on such connections).
ruleTester.run("call expression plugin alongside tag targets", checkSqlRule, {
  valid: [
    {
      options: withConnection({
        ...connections.base,
        keepAlive: false,
        targets: [{ tag: "sql" }],
        plugins: [callQueryPlugin],
      }),
      code: normalizeIndent`
        declare const db: {
          run<T>(): Promise<T>;
        };

        db.run<{ one: number }>();
      `,
    },
  ],
  invalid: [
    {
      options: withConnection({
        ...connections.base,
        keepAlive: false,
        targets: [{ tag: "sql" }],
        plugins: [callQueryPlugin],
      }),
      code: normalizeIndent`
        declare const db: {
          run<T>(): Promise<T>;
        };

        db.run();
      `,
      output: normalizeIndent`
        declare const db: {
          run<T>(): Promise<T>;
        };

        db.run<{ one: number }>();
      `,
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
  ],
});

ruleTester.run("call expression plugin with multiple type arguments", checkSqlRule, {
  valid: [],
  invalid: [
    {
      options: options(),
      code: normalizeIndent`
        declare const db: {
          run<A, B>(): Promise<A>;
        };

        db.run<{ one: number }, { two: number }>();
      `,
      errors: [{ messageId: "invalidTypeAnnotations" }],
    },
  ],
});
