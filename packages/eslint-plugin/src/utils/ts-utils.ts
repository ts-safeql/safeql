import ts from "typescript";

export const TSUtils = {
  isIdentifier: (node: ts.Node): node is ts.Identifier => {
    return node.kind === ts.SyntaxKind.Identifier;
  },
  isVariableDeclaration: (node: ts.Declaration): node is ts.VariableDeclaration => {
    return node.kind === ts.SyntaxKind.VariableDeclaration;
  },
  isTaggedTemplateExpression: (node: ts.Node): node is ts.TaggedTemplateExpression => {
    return node.kind === ts.SyntaxKind.TaggedTemplateExpression;
  },
  isNoSubstitutionTemplateLiteral: (node: ts.Node): node is ts.NoSubstitutionTemplateLiteral => {
    return node.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral;
  },
  isTemplateExpression: (node: ts.Node): node is ts.TemplateExpression => {
    return node.kind === ts.SyntaxKind.TemplateExpression;
  }
};
