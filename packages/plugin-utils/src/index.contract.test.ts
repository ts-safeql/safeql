import type ts from "typescript";
import type { ParserServices } from "@typescript-eslint/utils";

import type {
  QuerySourceMapEntry,
  ResolvedQuery,
  SafeQLPlugin,
  ResolveQueryContext,
  QueryNodeSelector,
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

const _queryKinds: QueryNodeSelector[] = [
  { kind: "TaggedTemplateExpression" },
  { kind: "CallExpression" },
  { kind: "CallExpression", callee: { property: { nameIn: ["execute"] } } },
];

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
};

void _assertResolvedQueryType;
void _queryContext;
void _testPlugin;
