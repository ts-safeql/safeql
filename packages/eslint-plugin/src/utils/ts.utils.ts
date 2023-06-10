import ts from "typescript";

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
    type: ts.Type
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
};
