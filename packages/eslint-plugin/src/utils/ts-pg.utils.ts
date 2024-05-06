import {
  defaultTypeMapping,
  doesMatchPattern,
  InvalidQueryError,
  normalizeIndent,
} from "@ts-safeql/shared";
import { TSESTreeToTSNode } from "@typescript-eslint/typescript-estree";
import { ParserServices, TSESTree } from "@typescript-eslint/utils";
import ts, { TypeChecker } from "typescript";
import { RuleOptionConnection } from "../rules/RuleOptions";
import { E, pipe } from "./fp-ts";
import { TSUtils } from "./ts.utils";

export function mapTemplateLiteralToQueryText(
  quasi: TSESTree.TemplateLiteral,
  parser: ParserServices,
  checker: ts.TypeChecker,
  options: RuleOptionConnection,
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
      getPgTypeFromTsType({ ...params, checker, options }),
    );

    if (E.isLeft(pgType)) {
      return E.left(InvalidQueryError.of(pgType.left, expression));
    }

    const pgTypeValue = pgType.right;

    $queryText += pgTypeValue === null ? `$${++$idx}` : `$${++$idx}::${pgTypeValue}`;
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

function getPgTypeFromTsTypeUnion(params: { types: ts.Type[] }) {
  const types = params.types.filter((t) => t.flags !== ts.TypeFlags.Null);
  const isUnionOfTheSameType = types.every((t) => t.flags === types[0].flags);
  const pgType = tsFlagToPgTypeMap[types[0].flags];

  if (!isUnionOfTheSameType || pgType === undefined) {
    return E.left(createMixedTypesInUnionErrorMessage(types.map((t) => t.flags)));
  }

  return E.right(pgType);
}

function getPgTypeFromTsType(params: {
  checker: TypeChecker;
  node: TSESTreeToTSNode<TSESTree.Expression>;
  type: ts.Type;
  options: RuleOptionConnection;
}): E.Either<string, string | null> {
  if (params.node.kind === ts.SyntaxKind.ConditionalExpression) {
    const whenTrue = params.checker.getTypeAtLocation(params.node.whenTrue);
    const whenTrueType = tsFlagToPgTypeMap[whenTrue.flags];

    const whenFalse = params.checker.getTypeAtLocation(params.node.whenFalse);
    const whenFalseType = tsFlagToPgTypeMap[whenFalse.flags];

    if (whenTrueType === undefined || whenFalseType === undefined) {
      return E.left(
        `Unsupported conditional expression flags (true = ${whenTrue.flags}, false = ${whenFalse.flags})`,
      );
    }

    if (whenTrueType !== whenFalseType) {
      return E.left(
        `Conditional expression must have the same type (true = ${whenTrueType}, false = ${whenFalseType})`,
      );
    }

    return E.right(whenTrueType);
  }

  if (params.node.kind === ts.SyntaxKind.Identifier) {
    const symbol = params.checker.getSymbolAtLocation(params.node);
    const type = params.checker.getTypeOfSymbolAtLocation(symbol!, params.node);

    if (TSUtils.isTsUnionType(type)) {
      return getPgTypeFromTsTypeUnion({ types: type.types });
    }

    if (TSUtils.isTsArrayUnionType(params.checker, type)) {
      return pipe(
        E.Do,
        E.chain(() => getPgTypeFromTsTypeUnion({ types: type.resolvedTypeArguments[0].types })),
        E.map((pgType) => `${pgType}[]`),
      );
    }
  }

  if (params.node.kind in tsKindToPgTypeMap) {
    return E.right(tsKindToPgTypeMap[params.node.kind]);
  }

  if (params.type.flags in tsFlagToPgTypeMap) {
    return E.right(tsFlagToPgTypeMap[params.type.flags]);
  }

  if (params.type.flags === ts.TypeFlags.Null) {
    return E.right(null);
  }

  if (TSUtils.isTsUnionType(params.type)) {
    const type = params.type.types.find((t) => t.flags in tsFlagToPgTypeMap);

    if (type !== undefined) {
      return E.right(tsFlagToPgTypeMap[type.flags]);
    }
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

  const typesWithOverrides = {
    ...defaultTypeMapping,
    ...params.options.overrides?.types,
  };

  const override = Object.entries(typesWithOverrides)
    .map(([key, value]) => ({ pgType: key, tsType: value }))
    .find((entry) =>
      doesMatchPattern({
        pattern: typeof entry.tsType === "string" ? entry.tsType : entry.tsType.parameter,
        text: singularType,
      }),
    );

  if (override !== undefined) {
    return isArray ? E.right(`${override.pgType}[]`) : E.right(override.pgType);
  }

  return E.left(normalizeIndent`
    The type "${typeStr}" has no corresponding PostgreSQL type.
    Please add it manually using the "overrides.types" option:

    \`\`\`ts
    {
      "connections": {
        ...,
        "overrides": {
          "types": {
            "PG TYPE (e.g. 'date')": "${typeStr}"
          }
        }
      }
    }
    \`\`\`

    Read docs - https://safeql.dev/api/#connections-overrides-types-optional
  `);
}

function createMixedTypesInUnionErrorMessage(flags: ts.TypeFlags[]) {
  const flagsAsText = flags
    .map((flag) => tsFlagToTsTypeStringMap[flag] ?? `unknown (${flag})`)
    .join(", ");

  return `Union types must be of the same type (found ${flagsAsText})`;
}
