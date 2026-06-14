import type ts from "typescript";
import type { ParserServices, TSESTree } from "@typescript-eslint/utils";

import type {
  QuerySourceMapEntry,
  ResolvedQuery,
  SafeQLPlugin,
  ResolveQueryContext,
  ResolvedSchemaType,
  SchemaTypeContext,
} from "./index";

const _sourcemap: QuerySourceMapEntry = {
  original: {
    start: 0,
    end: 4,
    text: "SELECT",
  },
  generated: {
    start: 0,
    end: 4,
    text: "SELECT",
  },
  offset: 0,
};

const sampleResolvedQuery: ResolvedQuery = {
  kind: "sql",
  text: "SELECT id FROM users",
  sourcemaps: [_sourcemap],
};

const _assertResolvedQueryType: ResolvedQuery = sampleResolvedQuery;

const _queryKinds: Array<"TaggedTemplateExpression" | "CallExpression"> = [
  "TaggedTemplateExpression",
  "CallExpression",
];

const _schemaType: ResolvedSchemaType = {
  tables: [
    {
      name: "users",
      reportNode: {} as TSESTree.Node,
      columns: [
        {
          name: "id",
          type: {} as ts.Type,
          typeNode: {} as ts.Node,
          reportNode: {} as TSESTree.Node,
        },
      ],
    },
  ],
};

const _schemaContext: SchemaTypeContext = {
  checker: {} as ts.TypeChecker,
  parser: {} as ParserServices,
  sourceFile: {} as ts.SourceFile,
  typeName: "Database",
};

const _queryContext: ResolveQueryContext = {
  checker: {} as ts.TypeChecker,
  parser: {} as ParserServices,
  precedingSQL: "SELECT * FROM users",
  tsNode: {} as ts.Node,
  tsType: {} as ts.Type,
  tsTypeText: "{ id: number }",
};

const _testPlugin: SafeQLPlugin = {
  name: "test-plugin",
  queryNodeKinds: _queryKinds,
  resolveQuery(context: ResolveQueryContext): ResolvedQuery | "skip" {
    void context;
    return sampleResolvedQuery;
  },
  resolveSchemaType(context: SchemaTypeContext): ResolvedSchemaType | undefined {
    void context;
    return _schemaType;
  },
};

void _assertResolvedQueryType;
void _schemaContext;
void _queryContext;
void _testPlugin;
