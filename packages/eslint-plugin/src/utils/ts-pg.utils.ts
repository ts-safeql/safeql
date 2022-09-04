import { InvalidQueryError } from "@safeql/shared";
import { ParserServices, TSESTree } from "@typescript-eslint/utils";
import { either } from "fp-ts";
import { pipe } from "fp-ts/lib/function";
import ts, { TypeChecker } from "typescript";
import { TSESTreeToTSNode } from "@typescript-eslint/typescript-estree";

export function mapTemplateLiteralToQueryText(
  quasi: TSESTree.TemplateLiteral,
  parser: ParserServices,
  checker: ts.TypeChecker
) {
  let $idx = 0;
  let $queryText = "";

  for (const $quasi of quasi.quasis) {
    $queryText += $quasi.value.raw;

    if ($quasi.tail) {
      break;
    }

    const expression = quasi.expressions[$idx];

    const pgType = pipe(
      mapExpressionToTsTypeString({ expression, parser, checker }),
      mapTsTypeStringToPgType
    );

    if (either.isLeft(pgType)) {
      return either.left(InvalidQueryError.of(pgType.left, expression));
    }

    const pgTypeValue = pgType.right;

    $queryText += `$${++$idx}::${pgTypeValue}`;
  }

  return either.right($queryText);
}

function mapExpressionToTsTypeString(params: {
  expression: TSESTree.Expression;
  parser: ParserServices;
  checker: ts.TypeChecker;
}) {
  const tsNode = params.parser.esTreeNodeToTSNodeMap.get(params.expression);
  const tsType = params.checker.getTypeAtLocation(tsNode);
  return {
    node: tsNode,
    type: tsType,
    checker: params.checker,
  };
}

const tsTypeToPgTypeMap: Record<string, string> = {
  number: "int",
  string: "text",
  boolean: "boolean",
  bigint: "bigint",
  any: "text",
  unknown: "text",
};

const tsKindToPgTypeMap: Record<number, string> = {
  [ts.SyntaxKind.StringLiteral]: "text",
  [ts.SyntaxKind.NumericLiteral]: "int",
  [ts.SyntaxKind.TrueKeyword]: "boolean",
  [ts.SyntaxKind.FalseKeyword]: "boolean",
  [ts.SyntaxKind.BigIntLiteral]: "bigint",
};

function mapTsTypeStringToPgType(params: {
  checker: TypeChecker;
  node: TSESTreeToTSNode<TSESTree.Expression>;
  type: ts.Type;
}) {
  if (params.node.kind in tsKindToPgTypeMap) {
    return either.right(tsKindToPgTypeMap[params.node.kind]);
  }

  const typeStr = params.checker.typeToString(params.type);
  const singularType = typeStr.replace(/\[\]$/, "");
  const isArray = typeStr !== singularType;
  const isSignularTypeSupported = singularType in tsTypeToPgTypeMap;

  if (isSignularTypeSupported) {
    return isArray
      ? either.right(`${tsTypeToPgTypeMap[singularType]}[]`)
      : either.right(tsTypeToPgTypeMap[singularType]);
  }

  return either.left(`the type "${typeStr}" is not supported`);
}
