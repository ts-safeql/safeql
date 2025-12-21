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

function getPgTypeFromTsTypeUnion(params: {
  types: ts.Type[];
  checker: ts.TypeChecker;
  options: RuleOptionConnection;
}): E.Either<string, PgTypeStrategy | null> {
  const { types, checker, options } = params;
  const nonNullTypes = types.filter((t) => (t.flags & ts.TypeFlags.Null) === 0);

  if (nonNullTypes.length === 0) {
    return E.right(null);
  }

  const isStringLiterals = nonNullTypes.every((t) => t.flags & ts.TypeFlags.StringLiteral);

  if (isStringLiterals) {
    return E.right({
      kind: "one-of",
      types: nonNullTypes.map((t) => (t as ts.StringLiteralType).value),
      cast: "text",
    });
  }

  const results = nonNullTypes.map((t) => checkType({ checker, type: t, options }));
  const strategies: PgTypeStrategy[] = [];

  for (const result of results) {
    if (E.isLeft(result)) {
      return result;
    }
    if (result.right !== null) {
      strategies.push(result.right);
    }
  }

  if (strategies.length === 0) {
    return E.right(null);
  }

  const firstStrategy = strategies[0];
  const mixedTypes: string[] = [firstStrategy.cast];

  for (let i = 1; i < strategies.length; i++) {
    const strategy = strategies[i];
    if (strategy.cast !== firstStrategy.cast) {
      mixedTypes.push(strategy.cast);
    }
  }

  if (mixedTypes.length > 1) {
    return E.left(
      `Union types must result in the same PostgreSQL type (found ${mixedTypes.join(", ")})`,
    );
  }

  return E.right(firstStrategy);
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

  if (node.kind === ts.SyntaxKind.ConditionalExpression) {
    const whenTrue = checkType({
      checker,
      type: checker.getTypeAtLocation(node.whenTrue),
      options,
    });

    const whenFalse = checkType({
      checker,
      type: checker.getTypeAtLocation(node.whenFalse),
      options,
    });

    if (E.isLeft(whenTrue)) {
      return whenTrue;
    }
    if (E.isLeft(whenFalse)) {
      return whenFalse;
    }

    const trueStrategy = whenTrue.right;
    const falseStrategy = whenFalse.right;

    if (trueStrategy === null && falseStrategy === null) {
      return E.right(null);
    }

    if (
      trueStrategy !== null &&
      falseStrategy !== null &&
      trueStrategy.cast !== falseStrategy.cast
    ) {
      return E.left(
        `Conditional expression must have the same type (true = ${trueStrategy.cast}, false = ${falseStrategy.cast})`,
      );
    }

    const strategy = trueStrategy ?? falseStrategy;
    if (strategy === null) {
      return E.right(null);
    }

    return E.right({ kind: "cast", cast: strategy.cast });
  }

  return checkType({ checker, type, options });
}

function checkType(params: {
  checker: TypeChecker;
  type: ts.Type;
  options: RuleOptionConnection;
}): E.Either<string, PgTypeStrategy | null> {
  const { checker, type, options } = params;

  if (type.flags & ts.TypeFlags.Null) {
    return E.right(null);
  }

  const typeStr = checker.typeToString(type);
  const singularType = typeStr.replace(/\[\]$/, "");
  const isArray = typeStr !== singularType;
  const singularPgType = tsTypeToPgTypeMap[singularType];

  if (singularPgType) {
    return E.right({ kind: "cast", cast: isArray ? `${singularPgType}[]` : singularPgType });
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

  const enumType = TSUtils.getEnumKind(type);

  if (enumType) {
    switch (enumType.kind) {
      case "Const":
      case "Numeric":
        return E.right({ kind: "cast", cast: "int" });
      case "String":
        return E.right({ kind: "one-of", types: enumType.values, cast: "text" });
      case "Heterogeneous":
        return E.left("Heterogeneous enums are not supported");
    }
  }

  if (checker.isArrayType(type)) {
    const elementType = (type as ts.TypeReference).typeArguments?.[0];

    if (elementType) {
      return pipe(
        checkType({ checker, type: elementType, options }),
        E.map((pgType): PgTypeStrategy | null =>
          pgType === null ? null : { kind: "cast", cast: `${pgType.cast}[]` },
        ),
      );
    }
  }

  if (type.isStringLiteral()) {
    return E.right({ kind: "literal", value: `'${type.value}'`, cast: "text" });
  }

  if (type.isNumberLiteral()) {
    return E.right({ kind: "literal", value: `${type.value}`, cast: "int" });
  }

  // Handle union types
  if (type.isUnion()) {
    return pipe(
      getPgTypeFromTsTypeUnion({ types: type.types, checker, options }),
      E.chain((pgType) =>
        pgType === null ? E.left("Unsupported union type (only null)") : E.right(pgType),
      ),
    );
  }

  if (type.flags in tsFlagToPgTypeMap) {
    const pgType = tsFlagToPgTypeMap[type.flags];
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
