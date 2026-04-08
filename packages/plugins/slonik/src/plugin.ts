import path from "path";
import type { TSESTree } from "@typescript-eslint/utils";
import { definePlugin, type ExpressionContext } from "@ts-safeql/plugin-utils";
import { createZodAnnotator } from "@ts-safeql/zod-annotator";
import ts from "typescript";

const zodTypeCheck = createZodAnnotator({ schemaArgIndex: 0 });

const TYPE_CAST_MAP: Record<string, string> = {
  json: "$N::json",
  jsonb: "$N::jsonb",
  binary: "$N::bytea",
  date: "$N::date",
  timestamp: "$N::timestamptz",
  interval: "$N::interval",
  uuid: "$N::uuid",
};

export default definePlugin({
  name: "slonik",
  package: "@ts-safeql/plugin-slonik",
  setup() {
    return {
      connectionDefaults: {
        enforceType: "suggest",
        overrides: {
          types: {
            date: "DateSqlToken",
            timestamp: "TimestampSqlToken",
            timestamptz: "TimestampSqlToken",
            interval: "IntervalSqlToken",
            json: "JsonSqlToken",
            jsonb: "JsonBinarySqlToken",
            uuid: "UuidSqlToken",
          },
        },
      },
      onTarget: ({ node, context }) => {
        const rootId = getRootIdentifier(node.tag);
        if (!rootId) return undefined;

        const tsNode = context.parser.esTreeNodeToTSNodeMap.get(rootId);
        const symbol = tsNode ? context.checker.getSymbolAtLocation(tsNode) : undefined;
        if (!isSlonikSymbol(context.checker, symbol)) return undefined;

        switch (getEstreeMethodName(node.tag)) {
          case "fragment":
            return false;
          case "unsafe":
          case "prepared":
          case "typeAlias":
            return { skipTypeAnnotations: true };
          case "type":
            return { typeCheck: zodTypeCheck };
          default:
            return undefined;
        }
      },
      onExpression: ({ node, context }) => {
        const translated = translateCallExpression(node, context.tsNode, context.checker);
        if (translated !== undefined) return translated;

        const inlinedFragment = resolveFragmentSql(context.tsNode, context.checker);
        if (inlinedFragment !== undefined) return inlinedFragment;

        return isFragmentTokenType(context) ? false : undefined;
      },
    };
  },
});

function getIdentifierName(
  node: TSESTree.Expression | TSESTree.PrivateIdentifier,
): string | undefined {
  return node.type === "Identifier" ? node.name : undefined;
}

function getEstreeMethodName(node: TSESTree.Expression): string | undefined {
  if (node.type === "MemberExpression") return getIdentifierName(node.property);
  if (node.type === "CallExpression" && node.callee.type === "MemberExpression") {
    return getIdentifierName(node.callee.property);
  }

  return undefined;
}

function translateCallExpression(
  node: TSESTree.Expression,
  tsNode: ts.Node,
  checker: ts.TypeChecker,
): string | false | undefined {
  if (node.type !== "CallExpression") return undefined;
  if (!isSlonikCallExpression(tsNode, checker)) return undefined;

  const method = getEstreeMethodName(node);
  if (!method) return undefined;

  const typeCast = TYPE_CAST_MAP[method];
  if (typeCast) return typeCast;

  switch (method) {
    case "identifier":
      return translateIdentifierCall(node.arguments[0]);
    case "array":
      return translateArrayCall(node.arguments[1], tsNode, checker);
    case "unnest":
      return translateUnnestCall(node.arguments[1]);
    case "literalValue": {
      const arg = node.arguments[0];
      return arg?.type === "Literal" && typeof arg.value === "string"
        ? quoteLiteral(arg.value)
        : false;
    }
    case "join":
      return false;
    default:
      return undefined;
  }
}

function translateIdentifierCall(arg: TSESTree.CallExpressionArgument | undefined): string | false {
  if (arg?.type !== "ArrayExpression") return false;

  const parts = getStaticStringLiterals(arg.elements);
  return parts ? joinIdentifierPath(parts) : false;
}

function translateArrayCall(
  arg: TSESTree.CallExpressionArgument | undefined,
  tsNode: ts.Node,
  checker: ts.TypeChecker,
): string | false {
  if (arg?.type === "Literal") {
    return typeof arg.value === "string" ? `$N::${arg.value}[]` : false;
  }

  const current = unwrapTsNode(tsNode);
  return ts.isCallExpression(current) && isSlonikFragmentExpression(current.arguments[1], checker)
    ? "$N"
    : false;
}

function translateUnnestCall(arg: TSESTree.CallExpressionArgument | undefined): string | false {
  if (arg?.type !== "ArrayExpression") return false;

  const parts = getStaticStringLiterals(arg.elements);
  if (!parts) return false;

  const types = parts.map((part) => `$N::${part}[]`);

  return types.length > 0 ? `unnest(${types.join(", ")})` : false;
}

function getRootIdentifier(node: TSESTree.Expression): TSESTree.Identifier | undefined {
  if (node.type === "Identifier") return node;
  if (node.type === "MemberExpression") return getRootIdentifier(node.object);
  if (node.type === "CallExpression") return getRootIdentifier(node.callee);
  return undefined;
}

function isSlonikSymbol(checker: ts.TypeChecker, symbol: ts.Symbol | undefined): boolean {
  if (!symbol) return false;

  const candidates = getSymbolCandidates(checker, symbol);
  if (candidates.some((candidate) => isImportedFromModule(candidate, "slonik"))) return true;

  return candidates.some((candidate) =>
    (candidate.declarations ?? []).some((declaration) =>
      path.normalize(declaration.getSourceFile().fileName).split(path.sep).includes("slonik"),
    ),
  );
}

function isFragmentTokenType(context: ExpressionContext): boolean {
  if (
    context.tsTypeText.includes("FragmentSqlToken") ||
    context.tsTypeText.includes("SqlFragmentToken")
  ) {
    return true;
  }

  const propertyNames = new Set(
    context.checker.getPropertiesOfType(context.tsType).map((property) => property.name),
  );

  return (
    ["sql", "values", "type"].every((name) => propertyNames.has(name)) &&
    !propertyNames.has("parser")
  );
}

function resolveFragmentSql(
  node: ts.Node,
  checker: ts.TypeChecker,
  visited = new Set<ts.Symbol>(),
): string | false | undefined {
  const expression = unwrapTsNode(node);

  if (ts.isIdentifier(expression)) {
    return resolveIdentifierFragmentSql(expression, checker, visited);
  }

  if (ts.isTaggedTemplateExpression(expression)) {
    return getTsMethodName(expression.tag) === "fragment" && isSlonikMethod(expression.tag, checker)
      ? buildFragmentTemplateSql(expression.template, checker, visited)
      : undefined;
  }

  if (ts.isCallExpression(expression)) {
    return resolveFragmentFactoryCall(expression, checker);
  }

  return undefined;
}

function joinIdentifierPath(parts: readonly string[]): string | false {
  return parts.length > 0
    ? parts.map((part) => `"${part.replaceAll('"', '""')}"`).join(".")
    : false;
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function isImportedFromModule(symbol: ts.Symbol, moduleName: string): boolean {
  return (symbol.declarations ?? []).some((declaration) => {
    let current: ts.Node | undefined = declaration;
    while (current && !ts.isImportDeclaration(current)) current = current.parent;

    return (
      current?.moduleSpecifier &&
      ts.isStringLiteralLike(current.moduleSpecifier) &&
      current.moduleSpecifier.text === moduleName
    );
  });
}

function getSymbolCandidates(checker: ts.TypeChecker, symbol: ts.Symbol): ts.Symbol[] {
  const resolved = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  return resolved === symbol ? [symbol] : [symbol, resolved];
}

function isSlonikCallExpression(node: ts.Node, checker: ts.TypeChecker): boolean {
  const current = unwrapTsNode(node);
  return ts.isCallExpression(current) && isSlonikMethod(current.expression, checker);
}

function isSlonikFragmentExpression(node: ts.Node, checker: ts.TypeChecker): boolean {
  const current = unwrapTsNode(node);
  return ts.isTaggedTemplateExpression(current)
    ? getTsMethodName(current.tag) === "fragment" && isSlonikMethod(current.tag, checker)
    : false;
}

function resolveIdentifierFragmentSql(
  node: ts.Identifier,
  checker: ts.TypeChecker,
  visited: Set<ts.Symbol>,
): string | false | undefined {
  const symbol = checker.getSymbolAtLocation(node);
  if (!symbol) return undefined;

  const candidates = getSymbolCandidates(checker, symbol);
  if (candidates.some((candidate) => visited.has(candidate))) return undefined;

  const nextVisited = new Set(visited);
  for (const candidate of candidates) {
    nextVisited.add(candidate);
  }

  for (const declaration of candidates.flatMap((candidate) => candidate.declarations ?? [])) {
    if (ts.isVariableDeclaration(declaration)) {
      const resolved = declaration.initializer
        ? resolveFragmentSql(declaration.initializer, checker, new Set(nextVisited))
        : undefined;
      if (resolved !== undefined) return resolved;
      continue;
    }

    if (!ts.isBindingElement(declaration)) continue;

    const initializer = resolveBindingElementInitializer(declaration);
    if (!initializer) continue;

    const resolved = resolveFragmentSql(initializer, checker, new Set(nextVisited));
    if (resolved !== undefined) return resolved;
  }

  return undefined;
}

function resolveBindingElementInitializer(element: ts.BindingElement): ts.Expression | undefined {
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

function getBindingSource(pattern: ts.BindingPattern): ts.Expression | undefined {
  const owner = pattern.parent;

  if (ts.isVariableDeclaration(owner)) return owner.initializer;
  if (ts.isBindingElement(owner)) return resolveBindingElementInitializer(owner);

  return undefined;
}

function resolveObjectBindingElementInitializer(
  element: ts.BindingElement,
  source: ts.Expression,
): ts.Expression | undefined {
  if (!ts.isObjectLiteralExpression(source)) return undefined;

  const propertyName = getTsPropertyName(element.propertyName ?? element.name);
  if (!propertyName) return undefined;

  const property = source.properties.find(
    (candidate): candidate is ts.PropertyAssignment | ts.ShorthandPropertyAssignment =>
      (ts.isPropertyAssignment(candidate) || ts.isShorthandPropertyAssignment(candidate)) &&
      getTsPropertyName(candidate.name) === propertyName,
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

function buildFragmentTemplateSql(
  template: ts.TemplateLiteral,
  checker: ts.TypeChecker,
  visited: Set<ts.Symbol>,
): string | false {
  if (ts.isNoSubstitutionTemplateLiteral(template)) return template.text;

  let sql = template.head.text;

  for (const span of template.templateSpans) {
    const resolved = resolveFragmentSql(span.expression, checker, new Set(visited));
    if (resolved === undefined || resolved === false) return false;

    sql += resolved;
    sql += span.literal.text;
  }

  return sql;
}

function resolveFragmentFactoryCall(
  node: ts.CallExpression,
  checker: ts.TypeChecker,
): string | false | undefined {
  const method = getTsMethodName(node);
  if (!method || !isSlonikMethod(node.expression, checker)) return undefined;

  switch (method) {
    case "literalValue":
      return ts.isStringLiteralLike(node.arguments[0])
        ? quoteLiteral(node.arguments[0].text)
        : false;
    case "identifier":
      return translateTsIdentifierCall(node.arguments[0]);
    case "join":
      return false;
    default:
      return undefined;
  }
}

function isSlonikMethod(node: ts.Expression, checker: ts.TypeChecker): boolean {
  const root = getTsRootIdentifier(node);
  return root ? isSlonikSymbol(checker, checker.getSymbolAtLocation(root)) : false;
}

function getTsMethodName(node: ts.Node): string | undefined {
  const current = unwrapTsNode(node);

  if (ts.isPropertyAccessExpression(current)) return current.name.text;
  if (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression)) {
    return current.expression.name.text;
  }

  return undefined;
}

function getTsRootIdentifier(node: ts.Expression): ts.Identifier | undefined {
  const current = unwrapTsNode(node);

  if (ts.isIdentifier(current)) return current;
  if (ts.isPropertyAccessExpression(current)) return getTsRootIdentifier(current.expression);
  if (ts.isCallExpression(current)) return getTsRootIdentifier(current.expression);

  return undefined;
}

function unwrapTsNode(node: ts.Node): ts.Node {
  let current = node;

  while (
    ts.isAsExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }

  return current;
}

function getTsPropertyName(node: ts.PropertyName | ts.BindingName): string | undefined {
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) return node.text;
  if (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) return node.text;
  return undefined;
}

function translateTsIdentifierCall(arg: ts.Expression | undefined): string | false {
  if (!arg || !ts.isArrayLiteralExpression(arg)) return false;

  const parts = getStaticTsStrings(arg.elements);
  return parts ? joinIdentifierPath(parts) : false;
}

function getStaticStringLiterals(
  elements: readonly (TSESTree.Expression | TSESTree.SpreadElement | null)[],
): string[] | undefined {
  const parts: string[] = [];

  for (const element of elements) {
    if (element?.type !== "Literal" || typeof element.value !== "string") {
      return undefined;
    }

    parts.push(element.value);
  }

  return parts;
}

function getStaticTsStrings(elements: readonly ts.Node[]): string[] | undefined {
  const parts: string[] = [];

  for (const element of elements) {
    if (!ts.isStringLiteralLike(element)) {
      return undefined;
    }

    parts.push(element.text);
  }

  return parts;
}
