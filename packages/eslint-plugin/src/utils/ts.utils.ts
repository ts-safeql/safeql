import ts from "typescript";

type EnumKind =
  | { kind: "Const" }
  | { kind: "Numeric" }
  | { kind: "String"; values: string[] }
  | { kind: "Heterogeneous" };

export const TSUtils = {
  isTypeUnion: (typeNode: ts.TypeNode | undefined): typeNode is ts.UnionTypeNode => {
    return typeNode?.kind === ts.SyntaxKind.UnionType;
  },
  isTsUnionType(type: ts.Type): type is ts.UnionType {
    return type.flags === ts.TypeFlags.Union;
  },
  isTsTypeReference(type: ts.Type): type is ts.TypeReference {
    return TSUtils.isTsObjectType(type) && type.objectFlags === ts.ObjectFlags.Reference;
  },
  isTsArrayUnionType(
    checker: ts.TypeChecker,
    type: ts.Type,
  ): type is ts.ObjectType & {
    objectFlags: ts.ObjectFlags.Reference;
    resolvedTypeArguments: (ts.TypeReference & { types: [ts.UnionType] })[];
  } {
    if (!TSUtils.isTsTypeReference(type)) {
      return false;
    }

    const firstArgument = checker.getTypeArguments(type)[0];

    if (firstArgument === undefined) {
      return false;
    }

    return TSUtils.isTsUnionType(firstArgument);
  },
  isTsObjectType(type: ts.Type): type is ts.ObjectType {
    return type.flags === ts.TypeFlags.Object;
  },
  getEnumKind(type: ts.Type): EnumKind | undefined {
    const symbol = type.getSymbol();
    if (!symbol || !(symbol.flags & ts.SymbolFlags.Enum)) {
      return undefined; // Not an enum
    }

    const declarations = symbol.getDeclarations();
    if (!declarations) {
      return undefined;
    }

    let hasString = false;
    let hasNumeric = false;
    const stringValues: string[] = [];

    for (const declaration of declarations) {
      if (ts.isEnumDeclaration(declaration)) {
        for (const member of declaration.members) {
          const initializer = member.initializer;

          if (initializer) {
            if (ts.isStringLiteralLike(initializer)) {
              hasString = true;
              stringValues.push(initializer.text);
            }

            if (initializer.kind === ts.SyntaxKind.NumericLiteral) {
              hasNumeric = true;
            }
          } else {
            // Members without initializers are numeric by default
            hasNumeric = true;
          }
        }
      }
    }

    // Determine the kind of enum
    if (symbol.flags & ts.SymbolFlags.ConstEnum) {
      return { kind: "Const" };
    }

    if (hasString && hasNumeric) {
      return { kind: "Heterogeneous" };
    }

    if (hasString) {
      return { kind: "String", values: stringValues };
    }

    return { kind: "Numeric" };
  },
};
