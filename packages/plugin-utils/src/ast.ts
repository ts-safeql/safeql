import path from "path";
import ts from "typescript";

export * as estree from "./ast-estree";

export type StaticValue = string | number | boolean | bigint | null | StaticValue[];

export const UNRESOLVED = Symbol("unresolved");

export function unwrap(params: { node: ts.Node }): ts.Node {
  const { node } = params;
  if (
    ts.isAsExpression(node) ||
    ts.isParenthesizedExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isAwaitExpression(node)
  ) {
    return unwrap({ node: node.expression });
  }

  return node;
}

export function getRootIdentifier(params: { node: ts.Node }): ts.Identifier | undefined {
  const node = unwrap(params);
  if (ts.isIdentifier(node)) return node;
  if (ts.isPropertyAccessExpression(node)) return getRootIdentifier({ node: node.expression });
  if (ts.isCallExpression(node)) return getRootIdentifier({ node: node.expression });
  return undefined;
}

export function isImportedFrom(params: {
  node: ts.Node;
  checker: ts.TypeChecker;
  moduleName: string;
}): boolean {
  const { node, checker, moduleName } = params;
  const root = getRootIdentifier({ node });
  if (!root) return false;
  return isSymbolImportedFrom({ checker, symbol: checker.getSymbolAtLocation(root), moduleName });
}

// Falls back to a `node_modules/<moduleName>` path so re-exports (which detach the import chain) still resolve.
export function isSymbolImportedFrom(params: {
  checker: ts.TypeChecker;
  symbol: ts.Symbol | undefined;
  moduleName: string;
}): boolean {
  const { checker, symbol, moduleName } = params;
  if (!symbol) return false;

  const candidates = getSymbolCandidates({ checker, symbol });

  if (candidates.some((candidate) => isImportedFromModule(candidate, moduleName))) {
    return true;
  }

  return candidates.some((candidate) =>
    (candidate.declarations ?? []).some((declaration) =>
      isPackageFile(declaration.getSourceFile().fileName, moduleName),
    ),
  );
}

export function getStaticValue(params: {
  node: ts.Node | undefined;
  checker: ts.TypeChecker;
}): StaticValue | typeof UNRESOLVED {
  return evaluateStaticValue(params.node, params.checker, new Set());
}

// `visited` guards against cyclic initializers (`const a = b; const b = a`); it
// grows only per resolution path, so sibling values still resolve independently.
function evaluateStaticValue(
  node: ts.Node | undefined,
  checker: ts.TypeChecker,
  visited: Set<ts.Symbol>,
): StaticValue | typeof UNRESOLVED {
  if (!node) return UNRESOLVED;

  const expression = unwrap({ node });

  if (ts.isStringLiteralLike(expression)) return expression.text;
  if (ts.isNumericLiteral(expression)) return Number(expression.text);
  if (ts.isBigIntLiteral(expression)) return BigInt(expression.text.replace(/n$/, ""));
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (expression.kind === ts.SyntaxKind.NullKeyword) return null;

  if (ts.isPrefixUnaryExpression(expression) && expression.operator === ts.SyntaxKind.MinusToken) {
    const operand = evaluateStaticValue(expression.operand, checker, visited);
    if (typeof operand === "number") return -operand;
    if (typeof operand === "bigint") return -operand;
    return UNRESOLVED;
  }

  if (ts.isIdentifier(expression)) {
    const symbol = resolveAliasedSymbol({
      checker,
      symbol: checker.getSymbolAtLocation(expression),
    });
    if (symbol && visited.has(symbol)) return UNRESOLVED;

    const initializer = findInitializer({ identifier: expression, checker });
    if (!initializer) return UNRESOLVED;

    return evaluateStaticValue(
      initializer,
      checker,
      symbol ? new Set(visited).add(symbol) : visited,
    );
  }

  if (ts.isArrayLiteralExpression(expression)) {
    const values: StaticValue[] = [];
    for (const element of expression.elements) {
      if (ts.isSpreadElement(element)) return UNRESOLVED;
      const value = evaluateStaticValue(element, checker, visited);
      if (value === UNRESOLVED) return UNRESOLVED;
      values.push(value);
    }
    return values;
  }

  return UNRESOLVED;
}

// For a destructured binding, resolves the value actually bound, not the binding's default.
export function findInitializer(params: {
  identifier: ts.Identifier;
  checker: ts.TypeChecker;
}): ts.Expression | undefined {
  const { identifier, checker } = params;
  const resolved = resolveAliasedSymbol({
    checker,
    symbol: checker.getSymbolAtLocation(identifier),
  });

  for (const declaration of resolved?.declarations ?? []) {
    if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
      return declaration.initializer;
    }

    if (ts.isBindingElement(declaration)) {
      const bound = getBindingInitializer({ element: declaration });
      if (bound) return bound;
      if (declaration.initializer) return declaration.initializer;
    }
  }

  return undefined;
}

export function getBindingInitializer(params: {
  element: ts.BindingElement;
}): ts.Expression | undefined {
  const { element } = params;
  if (element.dotDotDotToken) return undefined;

  const source = getBindingSource(element.parent);
  if (!source) return undefined;

  if (ts.isObjectBindingPattern(element.parent)) {
    return resolveObjectBindingElementInitializer(element, source);
  }

  if (ts.isArrayBindingPattern(element.parent)) {
    return resolveArrayBindingElementInitializer(element, source);
  }

  return undefined;
}

export function getMethodName(params: { node: ts.Node }): string | undefined {
  const current = unwrap(params);

  if (ts.isPropertyAccessExpression(current)) return current.name.text;
  if (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression)) {
    return current.expression.name.text;
  }

  return undefined;
}

export function getStringLiterals(params: { nodes: readonly ts.Node[] }): string[] | undefined {
  const parts: string[] = [];

  for (const node of params.nodes) {
    if (!ts.isStringLiteralLike(node)) return undefined;
    parts.push(node.text);
  }

  return parts;
}

function getBindingSource(pattern: ts.BindingPattern): ts.Expression | undefined {
  const owner = pattern.parent;

  if (ts.isVariableDeclaration(owner)) return owner.initializer;
  if (ts.isBindingElement(owner)) return getBindingInitializer({ element: owner });

  return undefined;
}

function resolveObjectBindingElementInitializer(
  element: ts.BindingElement,
  source: ts.Expression,
): ts.Expression | undefined {
  if (!ts.isObjectLiteralExpression(source)) return undefined;

  const propertyName = getPropertyName({ node: element.propertyName ?? element.name });
  if (!propertyName) return undefined;

  const property = source.properties.find(
    (candidate): candidate is ts.PropertyAssignment | ts.ShorthandPropertyAssignment =>
      (ts.isPropertyAssignment(candidate) || ts.isShorthandPropertyAssignment(candidate)) &&
      getPropertyName({ node: candidate.name }) === propertyName,
  );

  if (!property) return undefined;
  return ts.isPropertyAssignment(property) ? property.initializer : property.name;
}

function resolveArrayBindingElementInitializer(
  element: ts.BindingElement,
  source: ts.Expression,
): ts.Expression | undefined {
  if (!ts.isArrayLiteralExpression(source)) return undefined;

  const index = element.parent.elements.indexOf(element);
  if (index < 0) return undefined;

  const value = source.elements[index];
  return value && !ts.isOmittedExpression(value) && !ts.isSpreadElement(value) ? value : undefined;
}

export function getPropertyName(params: {
  node: ts.PropertyName | ts.BindingName;
}): string | undefined {
  const { node } = params;
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) return node.text;
  if (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) return node.text;
  return undefined;
}

export function getMemberNames(params: { node: ts.Node }): string[] {
  const expression = unwrap(params);

  if (ts.isIdentifier(expression)) return [expression.text];
  if (ts.isPropertyAccessExpression(expression)) {
    return [...getMemberNames({ node: expression.expression }), expression.name.text];
  }

  return [];
}

export function resolveAliasedSymbol(params: {
  checker: ts.TypeChecker;
  symbol: ts.Symbol | undefined;
}): ts.Symbol | undefined {
  const { checker, symbol } = params;
  if (!symbol) return undefined;
  return symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
}

export function getSymbolCandidates(params: {
  checker: ts.TypeChecker;
  symbol: ts.Symbol;
}): ts.Symbol[] {
  const { symbol } = params;
  const resolved = resolveAliasedSymbol(params);
  return resolved === undefined || resolved === symbol ? [symbol] : [symbol, resolved];
}

function isImportedFromModule(symbol: ts.Symbol, moduleName: string): boolean {
  return (symbol.declarations ?? []).some((declaration) => {
    let current: ts.Node | undefined = declaration;
    while (current && !ts.isImportDeclaration(current)) current = current.parent;

    return (
      current?.moduleSpecifier !== undefined &&
      ts.isStringLiteralLike(current.moduleSpecifier) &&
      current.moduleSpecifier.text === moduleName
    );
  });
}

function isPackageFile(fileName: string, moduleName: string): boolean {
  const parts = path.normalize(fileName).split(path.sep);
  const segments = moduleName.split("/");
  for (let i = 0; i <= parts.length - segments.length - 1; i++) {
    if (parts[i] === "node_modules" && segments.every((seg, j) => parts[i + 1 + j] === seg)) {
      return true;
    }
  }
  return false;
}
