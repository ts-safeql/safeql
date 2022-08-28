import ts from "typescript";

type BaseLiteral = "string" | "number" | "boolean" | "bigint" | "invalid" | "any";

/**
 * Helper function to get base type of node
 */
export function getBaseTypeOfLiteralType(
  type: ts.Type,
  typeChecker: ts.TypeChecker
): { type: BaseLiteral } | { type: "unknown"; value: string } {
  if (type.isNumberLiteral()) {
    return { type: "number" };
  }
  if (type.isStringLiteral() || isTypeFlagSet(type, ts.TypeFlags.TemplateLiteral)) {
    return { type: "string" };
  }
  // is BigIntLiteral
  if (type.flags & ts.TypeFlags.BigIntLiteral) {
    return { type: "bigint" };
  }
  if (type.isUnion()) {
    const types = type.types.map((type) => getBaseTypeOfLiteralType(type, typeChecker));

    return types.every((value) => value.type === types[0].type) ? types[0] : { type: "invalid" };
  }

  if (type.isIntersection()) {
    const types = type.types.map((type) => getBaseTypeOfLiteralType(type, typeChecker));

    if (types.some((value) => value.type === "string")) {
      return { type: "string" };
    }

    if (types.some((value) => value.type === "number")) {
      return { type: "number" };
    }

    if (types.some((value) => value.type === "bigint")) {
      return { type: "bigint" };
    }

    return { type: "invalid" };
  }

  const stringType = typeChecker.typeToString(type);

  if (
    stringType === "number" ||
    stringType === "string" ||
    stringType === "bigint" ||
    stringType === "any"
  ) {
    return { type: stringType };
  }

  if (stringType === "true" || stringType === "false" || stringType === "boolean") {
    return { type: "boolean" };
  }

  return { type: "unknown", value: stringType };
}

/**
 * Checks if the given type is (or accepts) the given flags
 * @param isReceiver true if the type is a receiving type (i.e. the type of a called function's parameter)
 */
export function isTypeFlagSet(
  type: ts.Type,
  flagsToCheck: ts.TypeFlags,
  isReceiver?: boolean
): boolean {
  const flags = getTypeFlags(type);

  if (isReceiver && flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) {
    return true;
  }

  return (flags & flagsToCheck) !== 0;
}

/**
 * Gets all of the type flags in a type, iterating through unions automatically
 */
export function getTypeFlags(type: ts.Type): ts.TypeFlags {
  let flags: ts.TypeFlags = 0;
  for (const t of unionTypeParts(type)) {
    flags |= t.flags;
  }
  return flags;
}

/** Returns all types of a union type or an array containing `type` itself if it's no union type. */
function unionTypeParts(type: ts.Type): ts.Type[] {
  return isUnionType(type) ? type.types : [type];
}

function isUnionType(type: ts.Type): type is ts.UnionType {
  return (type.flags & ts.TypeFlags.Union) !== 0;
}
