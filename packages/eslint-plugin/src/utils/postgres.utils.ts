import { ParserServices, TSESTree } from "@typescript-eslint/utils";
import { either } from "fp-ts";
import * as ts from "typescript";
import { assertNever } from "../utils/assertNever";
import { getBaseTypeOfLiteralType } from "../utils/ts.utils";

export function mapTemplateLiteralToQueryText(
  quasi: TSESTree.TemplateLiteral,
  parser: ParserServices,
  typeChecker: ts.TypeChecker
) {
  let $idx = 0;
  let $queryText = "";

  for (const $quasi of quasi.quasis) {
    $queryText += $quasi.value.raw;

    if ($quasi.tail) {
      break;
    }

    const pgType = mapTsTypeToPgType(
      typeChecker.getTypeAtLocation(parser.esTreeNodeToTSNodeMap.get(quasi.expressions[$idx])),
      typeChecker
    );

    if (either.isLeft(pgType)) {
      return either.left({
        error: pgType.left,
        expr: quasi.expressions[$idx],
      });
    }

    const pgTypeValue = pgType.right;

    $queryText += `$${++$idx}::${pgTypeValue}`;
  }

  return either.right($queryText);
}

function mapTsTypeToPgType(type: ts.Type, typeChecker: ts.TypeChecker) {
  const baseType = getBaseTypeOfLiteralType(type, typeChecker);

  switch (baseType.type) {
    case "any":
    case "invalid":
      return either.left(`The type "${baseType}" is not supported`);
    case "unknown":
      return either.left(`The type "${baseType.value}" is not supported`);
    case "bigint":
      return either.right("bigint");
    case "boolean":
      return either.right("boolean");
    case "number":
      return either.right("int");
    case "string":
      return either.right("text");
    default:
      assertNever(baseType);
  }
}
