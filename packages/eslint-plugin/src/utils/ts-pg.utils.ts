import { InvalidQueryError } from "@ts-safeql/shared";
import { TSESTreeToTSNode } from "@typescript-eslint/typescript-estree";
import { ParserServices, TSESTree } from "@typescript-eslint/utils";
import ts, { TypeChecker } from "typescript";
import { RuleOptionConnection } from "../rules/check-sql.rule";
import { E, pipe } from "./fp-ts";

export function mapTemplateLiteralToQueryText(
  quasi: TSESTree.TemplateLiteral,
  parser: ParserServices,
  checker: ts.TypeChecker,
  options: RuleOptionConnection
) {
  let $idx = 0;
  let $queryText = "";

  for (const $quasi of quasi.quasis) {
    $queryText += $quasi.value.raw;

    if ($quasi.tail) {
      break;
    }

    const expression = quasi.expressions[$idx];

    const pgType = pipe(mapExpressionToTsTypeString({ expression, parser, checker }), (params) =>
      mapTsTypeStringToPgType({ ...params, checker, options })
    );

    if (E.isLeft(pgType)) {
      return E.left(InvalidQueryError.of(pgType.left, expression));
    }

    const pgTypeValue = pgType.right;

    $queryText += `$${++$idx}::${pgTypeValue}`;
  }

  return E.right($queryText);
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

const tsFlagToTsTypeStringMap: Record<number, string> = {
  [ts.TypeFlags.String]: "string",
  [ts.TypeFlags.Number]: "number",
  [ts.TypeFlags.Boolean]: "boolean",
  [ts.TypeFlags.BigInt]: "bigint",
  [ts.TypeFlags.NumberLiteral]: "number",
  [ts.TypeFlags.StringLiteral]: "string",
  [ts.TypeFlags.BooleanLiteral]: "boolean",
  [ts.TypeFlags.BigIntLiteral]: "bigint",
};

const tsFlagToPgTypeMap: Record<number, string> = {
  [ts.TypeFlags.String]: "text",
  [ts.TypeFlags.Number]: "int",
  [ts.TypeFlags.Boolean]: "boolean",
  [ts.TypeFlags.BigInt]: "bigint",
  [ts.TypeFlags.NumberLiteral]: "int",
  [ts.TypeFlags.StringLiteral]: "text",
  [ts.TypeFlags.BooleanLiteral]: "boolean",
  [ts.TypeFlags.BigIntLiteral]: "bigint",
};

function mapTsTypeStringToPgType(params: {
  checker: TypeChecker;
  node: TSESTreeToTSNode<TSESTree.Expression>;
  type: ts.Type;
  options: RuleOptionConnection;
}) {
  if (params.node.kind === ts.SyntaxKind.ConditionalExpression) {
    const whenTrue = params.checker.getTypeAtLocation(params.node.whenTrue);
    const whenTrueType = tsFlagToPgTypeMap[whenTrue.flags];

    const whenFalse = params.checker.getTypeAtLocation(params.node.whenFalse);
    const whenFalseType = tsFlagToPgTypeMap[whenFalse.flags];

    if (whenTrueType === undefined || whenFalseType === undefined) {
      return E.left(
        `Unsupported conditional expression flags (true = ${whenTrue.flags}, false = ${whenFalse.flags})`
      );
    }

    if (whenTrueType !== whenFalseType) {
      return E.left(
        `Conditional expression must have the same type (true = ${whenTrueType}, false = ${whenFalseType})`
      );
    }

    return E.right(whenTrueType);
  }

  if (params.node.kind === ts.SyntaxKind.Identifier) {
    const symbol = params.checker.getSymbolAtLocation(params.node);
    const type = params.checker.getTypeOfSymbolAtLocation(symbol!, params.node);

    if (isTsUnionType(type)) {
      const isUnionOfTheSameType = type.types.every((t) => t.flags === type.types[0].flags);
      const pgType = tsFlagToPgTypeMap[type.types[0].flags];

      if (!isUnionOfTheSameType || pgType === undefined) {
        return E.left(createMixedTypesInUnionErrorMessage(type.types.map((t) => t.flags)));
      }

      return E.right(pgType);
    }
  }

  if (params.node.kind in tsKindToPgTypeMap) {
    return E.right(tsKindToPgTypeMap[params.node.kind]);
  }

  if (params.type.flags in tsFlagToPgTypeMap) {
    return E.right(tsFlagToPgTypeMap[params.type.flags]);
  }

  const typeStr = params.checker.typeToString(params.type);
  const singularType = typeStr.replace(/\[\]$/, "");
  const isArray = typeStr !== singularType;
  const isSignularTypeSupported = singularType in tsTypeToPgTypeMap;

  if (isSignularTypeSupported) {
    return isArray
      ? E.right(`${tsTypeToPgTypeMap[singularType]}[]`)
      : E.right(tsTypeToPgTypeMap[singularType]);
  }

  if (params.options.overrides?.types !== undefined) {
    const override = Object.entries(params.options.overrides.types)
      .map(([key, value]) => ({ pgType: key, tsType: value }))
      .find((entry) => entry.tsType === singularType);

    if (override !== undefined) {
      return isArray ? E.right(`${override.pgType}[]`) : E.right(override.pgType);
    }
  }

  return E.left(`the type "${typeStr}" is not supported`);
}

function isTsUnionType(type: ts.Type): type is ts.UnionType {
  return type.flags === ts.TypeFlags.Union;
}

function createMixedTypesInUnionErrorMessage(flags: ts.TypeFlags[]) {
  const flagsAsText = flags
    .map((flag) => tsFlagToTsTypeStringMap[flag] ?? `unknown (${flag})`)
    .join(", ");

  return `Union types must be of the same type (found ${flagsAsText})`;
}
