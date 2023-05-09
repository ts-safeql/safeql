import ts from "typescript";

export const TSUtils = {
  isTypeUnion: (typeNode: ts.TypeNode | undefined): typeNode is ts.UnionTypeNode => {
    return typeNode?.kind === ts.SyntaxKind.UnionType;
  },
};
