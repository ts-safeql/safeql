import {
  defaultTypeMapping,
  doesMatchPattern,
  InvalidQueryError,
  normalizeIndent,
  QuerySourceMapEntry,
} from "@ts-safeql/shared";
import { TSESTreeToTSNode } from "@typescript-eslint/typescript-estree";
import { ParserServices, TSESLint, TSESTree } from "@typescript-eslint/utils";
import ts, { TypeChecker } from "typescript";
import { RuleOptionConnection } from "../rules/RuleOptions";
import { E, pipe } from "./fp-ts";
import { TSUtils } from "./ts.utils";
import { isLastQueryContextOneOf } from "./query-context";

export function mapTemplateLiteralToQueryText(
  quasi: TSESTree.TemplateLiteral,
  parser: ParserServices,
  checker: ts.TypeChecker,
  options: RuleOptionConnection,
  sourceCode: Readonly<TSESLint.SourceCode>,
) {
  let $idx = 0;
  let $queryText = "";
  const sourcemaps: QuerySourceMapEntry[] = [];

  for (const [quasiIdx, $quasi] of quasi.quasis.entries()) {
    $queryText += $quasi.value.raw;

    if ($quasi.tail) {
      break;
    }

    const position = $queryText.length;
    const expression = quasi.expressions[quasiIdx];

    const pgType = pipe(mapExpressionToTsTypeString({ expression, parser, checker }), (params) =>
      getPgTypeFromTsType({ ...params, checker, options }),
    );

    if (E.isLeft(pgType)) {
      return E.left(InvalidQueryError.of(pgType.left, expression));
    }

    const pgTypeValue = pgType.right;

    if (pgTypeValue === null) {
      const placeholder = `$${++$idx}`;
      $queryText += placeholder;

      sourcemaps.push({
        original: {
          text: sourceCode.text.slice(expression.range[0] - 2, expression.range[1] + 1),
          start: expression.range[0] - quasi.range[0] - 2,
          end: expression.range[1] - quasi.range[0] + 1,
        },
        generated: {
          text: placeholder,
          start: position,
          end: position + placeholder.length,
        },
        offset: 0,
      });

      continue;
    }

    if (pgTypeValue.kind === "literal") {
      const placeholder = pgTypeValue.value;
      $queryText += placeholder;

      sourcemaps.push({
        original: {
          start: expression.range[0] - quasi.range[0] - 2,
          end: expression.range[1] - quasi.range[0] + 1,
          text: sourceCode.text.slice(expression.range[0] - 2, expression.range[1] + 1),
        },
        generated: {
          start: position,
          end: position + placeholder.length,
          text: placeholder,
        },
        offset: 0,
      });

      continue;
    }

    const escapePgValue = (text: string) => text.replace(/'/g, "''");

    if (
      pgTypeValue.kind === "one-of" &&
      $queryText.trimEnd().endsWith("=") &&
      isLastQueryContextOneOf($queryText, ["SELECT", "ON", "WHERE", "WHEN", "HAVING", "RETURNING"])
    ) {
      const textFromEquals = $queryText.slice($queryText.lastIndexOf("="));
      const placeholder = `IN (${pgTypeValue.types.map((t) => `'${escapePgValue(t)}'`).join(", ")})`;
      const expressionText = sourceCode.text.slice(
        expression.range[0] - 2,
        expression.range[1] + 1,
      );

      $queryText = $queryText.replace(/(=)\s*$/, "");
      $queryText += placeholder;

      sourcemaps.push({
        original: {
          start: expression.range[0] - quasi.range[0] - 2 - textFromEquals.length,
          end: expression.range[1] - quasi.range[0] + 2 - textFromEquals.length,
          text: `${textFromEquals}${expressionText}`,
        },
        generated: {
          start: position - textFromEquals.length + 1,
          end: position + placeholder.length - textFromEquals.length,
          text: placeholder,
        },
        offset: textFromEquals.length,
      });

      continue;
    }

    const placeholder = `$${++$idx}::${pgTypeValue.cast}`;
    $queryText += placeholder;

    sourcemaps.push({
      original: {
        start: expression.range[0] - quasi.range[0] - 2,
        end: expression.range[1] - quasi.range[0],
        text: sourceCode.text.slice(expression.range[0] - 2, expression.range[1] + 1),
      },
      generated: {
        start: position,
        end: position + placeholder.length,
        text: placeholder,
      },
      offset: 0,
    });
  }

  return E.right({ text: $queryText, sourcemaps });
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

function getPgTypeFromTsTypeUnion(params: { types: ts.Type[] }): E.Either<string, PgTypeStrategy> {
  const types = params.types.filter((t) => t.flags !== ts.TypeFlags.Null);
  const isStringLiterals = types.every((t) => t.flags === ts.TypeFlags.StringLiteral);

  if (isStringLiterals) {
    return E.right({
      kind: "one-of",
      types: types.map((t) => (t as ts.StringLiteralType).value),
      cast: "text",
    });
  }

  const isUnionOfTheSameType = types.every((t) => t.flags === types[0].flags);
  const pgType = tsFlagToPgTypeMap[types[0].flags];

  if (!isUnionOfTheSameType || pgType === undefined) {
    return E.left(createMixedTypesInUnionErrorMessage(types.map((t) => t.flags)));
  }

  return E.right({ kind: "cast", cast: pgType });
}

type PgTypeStrategy =
  | { kind: "cast"; cast: string }
  | { kind: "literal"; value: string; cast: string }
  | { kind: "one-of"; types: string[]; cast: string };

function getPgTypeFromTsType(params: {
  checker: TypeChecker;
  node: TSESTreeToTSNode<TSESTree.Expression>;
  type: ts.Type;
  options: RuleOptionConnection;
}): E.Either<string, PgTypeStrategy | null> {
  const { checker, node, type, options } = params;

  // Utility function to get PostgreSQL type from flags
  const getPgTypeFromFlags = (flags: ts.TypeFlags) => tsFlagToPgTypeMap[flags];

  // Check for conditional expression
  if (node.kind === ts.SyntaxKind.ConditionalExpression) {
    const whenTrueType = getPgTypeFromFlags(checker.getTypeAtLocation(node.whenTrue).flags);
    const whenFalseType = getPgTypeFromFlags(checker.getTypeAtLocation(node.whenFalse).flags);

    if (!whenTrueType || !whenFalseType) {
      return E.left(
        `Unsupported conditional expression flags (true = ${whenTrueType}, false = ${whenFalseType})`,
      );
    }

    if (whenTrueType !== whenFalseType) {
      return E.left(
        `Conditional expression must have the same type (true = ${whenTrueType}, false = ${whenFalseType})`,
      );
    }

    return E.right({ kind: "cast", cast: whenTrueType });
  }

  // Check for identifier
  if (node.kind === ts.SyntaxKind.Identifier) {
    const symbol = checker.getSymbolAtLocation(node);
    const symbolType = checker.getTypeOfSymbolAtLocation(symbol!, node);

    if (TSUtils.isTsUnionType(symbolType)) {
      return getPgTypeFromTsTypeUnion({ types: symbolType.types });
    }

    if (TSUtils.isTsArrayUnionType(checker, symbolType)) {
      const elementTypeUnion = symbolType.resolvedTypeArguments?.[0].types;
      return elementTypeUnion
        ? pipe(
            getPgTypeFromTsTypeUnion({ types: elementTypeUnion }),
            E.map((pgType) => ({ kind: "cast", cast: `${pgType.cast}[]` })),
          )
        : E.left("Invalid array union type");
    }
  }

  if (node.kind === ts.SyntaxKind.StringLiteral) {
    return E.right({ kind: "literal", value: `'${node.text}'`, cast: "text" });
  }

  // Check for known SyntaxKind mappings
  if (node.kind in tsKindToPgTypeMap) {
    return E.right({ kind: "cast", cast: tsKindToPgTypeMap[node.kind] });
  }

  // Check for known type flags
  if (type.flags in tsFlagToPgTypeMap) {
    return E.right({ kind: "cast", cast: tsFlagToPgTypeMap[type.flags] });
  }

  // Handle null type
  if (type.flags === ts.TypeFlags.Null) {
    return E.right(null);
  }

  // Handle union types
  if (TSUtils.isTsUnionType(type)) {
    const matchingType = type.types.find((t) => t.flags in tsFlagToPgTypeMap);
    return matchingType
      ? E.right({ kind: "cast", cast: tsFlagToPgTypeMap[matchingType.flags] })
      : E.left("Unsupported union type");
  }

  // Handle array types
  const typeStr = checker.typeToString(type);
  const singularType = typeStr.replace(/\[\]$/, "");
  const isArray = typeStr !== singularType;
  const singularPgType = tsTypeToPgTypeMap[singularType];

  if (singularPgType) {
    return E.right({ kind: "cast", cast: isArray ? `${singularPgType}[]` : singularPgType });
  }

  if (checker.isArrayType(type)) {
    const elementType = (type as ts.TypeReference).typeArguments?.[0];
    if (
      elementType?.isUnion() &&
      elementType.types.every((t) => t.flags === elementType.types[0].flags)
    ) {
      return E.right({ kind: "cast", cast: `${getPgTypeFromFlags(elementType.types[0].flags)}[]` });
    }
  }

  // Handle overrides
  const typesWithOverrides = { ...defaultTypeMapping, ...options.overrides?.types };
  const override = Object.entries(typesWithOverrides).find(([, tsType]) =>
    doesMatchPattern({
      pattern: typeof tsType === "string" ? tsType : tsType.parameter,
      text: singularType,
    }),
  );

  if (override) {
    const [pgType] = override;
    return E.right({ kind: "cast", cast: isArray ? `${pgType}[]` : pgType });
  }

  // Fallback for unsupported types
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
