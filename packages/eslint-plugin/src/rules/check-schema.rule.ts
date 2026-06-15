import { ResolvedTarget } from "@ts-safeql/generate";
import { PluginManager, type SafeQLPlugin } from "@ts-safeql/plugin-utils";
import {
  ESLintUtils,
  type ParserServices,
  type ParserServicesWithTypeInformation,
  TSESLint,
} from "@typescript-eslint/utils";
import { JSONSchema4 } from "@typescript-eslint/utils/json-schema";
import ts from "typescript";
import { E, J, flow } from "../utils/fp-ts";
import {
  ExpectedResolvedTarget,
  getResolvedTargetByType,
} from "../utils/get-resolved-target-by-type-node";
import { memoize } from "../utils/memoize";
import { locateNearestPackageJsonDir } from "../utils/node.utils";
import { hasParserServicesWithTypeInformation } from "../utils/parser-services";
import { workers } from "../workers";
import { IntrospectSchemaWorkerResult, WorkerError } from "../workers/check-sql.worker";
import {
  Config,
  InferLiteralsOption,
  RuleOptionConnection,
  RuleOptions,
  defaultInferLiteralOptions,
} from "./RuleOptions";
import { getConfigFromFileWithContext } from "./check-sql.config";
import {
  getResolvedTargetComparableString,
  getResolvedTargetsEquality,
  shouldLintFile,
} from "./check-sql.utils";
import z from "zod";

const messages = {
  schemaError: "{{error}}",
  schemaMissingTable:
    'Table "{{table}}" is declared in `{{typeName}}` but does not exist in the database',
  schemaMissingColumn:
    'Column "{{table}}.{{column}}" is declared in `{{typeName}}` but does not exist in the database',
  schemaExtraColumn:
    'Column "{{table}}.{{column}}" exists in the database but is missing from `{{typeName}}`',
  schemaColumnTypeMismatch:
    'Column "{{table}}.{{column}}" type mismatch.\n\tDatabase: {{expected}}\n\t    Type: {{actual}}',
};

export type SchemaRuleMessage = keyof typeof messages;

type SchemaRuleContext = Readonly<TSESLint.RuleContext<SchemaRuleMessage, RuleOptions>>;

const pluginManager = new PluginManager();

const introspectSchemaSyncE = flow(
  workers.generateSync,
  E.chain(J.parse),
  E.chainW((parsed) => parsed as unknown as E.Either<WorkerError, IntrospectSchemaWorkerResult>),
  E.mapLeft((error) => error as unknown as WorkerError),
);

const createRule = ESLintUtils.RuleCreator(() => `https://github.com/ts-safeql/safeql`)<
  RuleOptions,
  SchemaRuleMessage
>;

export default createRule({
  name: "check-schema",
  meta: {
    docs: {
      description: "Ensure a database schema type stays in sync with the live database",
    },
    messages,
    type: "problem",
    schema: z.toJSONSchema(RuleOptions, { target: "draft-4" }) as JSONSchema4,
  },
  defaultOptions: [],
  create(context) {
    if (!shouldLintFile(context)) {
      return {};
    }

    const services = context.sourceCode.parserServices;
    if (!hasParserServicesWithTypeInformation(services)) {
      return {};
    }

    const projectDir = memoize({
      key: context.filename,
      value: () => locateNearestPackageJsonDir(context.filename),
    });

    const config = memoize({
      key: JSON.stringify({ key: "schema-config", options: context.options, projectDir }),
      value: () => getConfigFromFileWithContext({ context, projectDir }),
    });

    return {
      Program() {
        checkSchema({ context, config, projectDir, services });
      },
    };
  },
});

function checkSchema(params: {
  context: SchemaRuleContext;
  config: Config;
  projectDir: string;
  services: ParserServicesWithTypeInformation;
}) {
  const { context, config, projectDir, services } = params;

  const connections = Array.isArray(config.connections) ? config.connections : [config.connections];

  for (const connection of connections) {
    if (connection.schema === undefined) {
      continue;
    }

    checkConnectionSchema({ context, connection, projectDir, services });
  }
}

function checkConnectionSchema(params: {
  context: SchemaRuleContext;
  connection: RuleOptionConnection;
  projectDir: string;
  services: ParserServicesWithTypeInformation;
}) {
  const { context, connection, projectDir, services } = params;
  const schema = connection.schema;
  if (schema === undefined) {
    return;
  }

  const checker = services.program.getTypeChecker();
  const sourceFile = services.program.getSourceFile(context.filename);
  if (sourceFile === undefined) {
    return;
  }

  const plugins = resolveConnectionPlugins(connection, projectDir);

  let resolved: ReturnType<typeof resolveSchemaTypeFromPlugins>;
  try {
    resolved = resolveSchemaTypeFromPlugins({
      plugins,
      checker,
      parser: services,
      sourceFile,
      typeName: schema.type,
    });
  } catch (error) {
    context.report({
      loc: { line: 1, column: 0 },
      messageId: "schemaError",
      data: { error: errorToString(error) },
    });
    return;
  }

  // check-schema runs per file; only the file that declares the schema type
  // resolves one. Every other file resolves nothing and is skipped — reporting
  // here would flag every file that doesn't contain the type.
  if (resolved === undefined || resolved.tables.length === 0) {
    return;
  }

  const introspection = introspectSchemaSyncE({
    mode: "introspect-schema",
    connection,
    projectDir,
    fieldTransform: schema.fieldTransform,
    // The diff only inspects tables declared in the user's type, so DB-only
    // tables (e.g. migration bookkeeping) are already ignored; `excludeTables`
    // is just an optional introspection-scoping hint.
    excludeTables: schema.excludeTables,
  });

  if (E.isLeft(introspection)) {
    context.report({
      loc: { line: 1, column: 0 },
      messageId: "schemaError",
      data: { error: errorToString(introspection.left) },
    });
    return;
  }

  // Index by both bare and schema-qualified name so a schema-qualified table
  // type (e.g. `private.users`) resolves the right table. A bare name shared by
  // multiple schemas is ambiguous and reported below rather than guessed.
  const dbTablesByName = new Map<string, (typeof introspection.right.tables)[number]>();
  const bareNameCounts = new Map<string, number>();
  for (const t of introspection.right.tables) {
    dbTablesByName.set(`${t.schemaName}.${t.tableName}`, t);
    bareNameCounts.set(t.tableName, (bareNameCounts.get(t.tableName) ?? 0) + 1);
    if (!dbTablesByName.has(t.tableName)) {
      dbTablesByName.set(t.tableName, t);
    }
  }

  const nullAsOptional = connection.nullAsOptional ?? false;
  const nullAsUndefined = connection.nullAsUndefined ?? false;
  const inferLiterals: InferLiteralsOption = connection.inferLiterals ?? defaultInferLiteralOptions;
  const reservedTypes = new Set<string>();

  for (const table of resolved.tables) {
    if (!table.name.includes(".") && (bareNameCounts.get(table.name) ?? 0) > 1) {
      context.report({
        node: table.reportNode,
        messageId: "schemaError",
        data: {
          error: `Table "${table.name}" exists in multiple schemas; use a schema-qualified name (e.g. "public.${table.name}").`,
        },
      });
      continue;
    }

    const dbTable = dbTablesByName.get(table.name);

    if (dbTable === undefined) {
      context.report({
        node: table.reportNode,
        messageId: "schemaMissingTable",
        data: { table: table.name, typeName: schema.type },
      });
      continue;
    }

    const dbColumns = new Map<string, ResolvedTarget>(dbTable.columns);
    const seen = new Set<string>();

    for (const column of table.columns) {
      seen.add(column.name);
      const generated = dbColumns.get(column.name);

      if (generated === undefined) {
        context.report({
          node: column.reportNode,
          messageId: "schemaMissingColumn",
          data: { table: table.name, column: column.name, typeName: schema.type },
        });
        continue;
      }

      const expected = getResolvedTargetByType({
        type: column.type,
        checker,
        parser: services,
        reservedTypes,
        anchorNode: column.typeNode,
      });

      const equality = getResolvedTargetsEquality({
        expected,
        generated,
        nullAsOptional,
        nullAsUndefined,
        inferLiterals,
      });

      if (!equality.isEqual) {
        context.report({
          node: column.reportNode,
          messageId: "schemaColumnTypeMismatch",
          data: {
            table: table.name,
            column: column.name,
            expected: comparableString(generated, {
              nullAsOptional,
              nullAsUndefined,
              inferLiterals,
            }),
            // The equality check compares the user type without null-transforms,
            // so render it the same way to keep the message consistent.
            actual: comparableString(expected, {
              nullAsOptional: false,
              nullAsUndefined: false,
              inferLiterals,
            }),
          },
        });
      }
    }

    // Columns present in the database but absent from the user's type.
    for (const [dbColumnName] of dbTable.columns) {
      if (!seen.has(dbColumnName)) {
        context.report({
          node: table.reportNode,
          messageId: "schemaExtraColumn",
          data: { table: table.name, column: dbColumnName, typeName: schema.type },
        });
      }
    }
  }
}

function errorToString(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "object" && error !== null && "message" in error) {
    return String(error.message);
  }
  return String(error);
}

function comparableString(
  target: ExpectedResolvedTarget | ResolvedTarget,
  options: {
    nullAsOptional: boolean;
    nullAsUndefined: boolean;
    inferLiterals: InferLiteralsOption;
  },
): string {
  return getResolvedTargetComparableString({ target, ...options }).replace(/'/g, '"');
}

function resolveConnectionPlugins(
  connection: RuleOptionConnection,
  projectDir: string,
): SafeQLPlugin[] {
  if (!("plugins" in connection) || !connection.plugins?.length) {
    return [];
  }

  return pluginManager.resolvePluginsSync(connection.plugins, projectDir);
}

function resolveSchemaTypeFromPlugins(params: {
  plugins: SafeQLPlugin[];
  checker: ts.TypeChecker;
  parser: ParserServices;
  sourceFile: ts.SourceFile;
  typeName: string;
}) {
  for (const plugin of params.plugins) {
    const result = plugin.resolveSchemaType?.({
      checker: params.checker,
      parser: params.parser,
      sourceFile: params.sourceFile,
      typeName: params.typeName,
    });

    if (result !== undefined) {
      return result;
    }
  }

  return undefined;
}
