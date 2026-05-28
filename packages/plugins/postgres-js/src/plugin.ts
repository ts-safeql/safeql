import type { TSESTree } from "@typescript-eslint/utils";
import { definePlugin, type TargetContext, type TargetMatch } from "@ts-safeql/plugin-utils";
import ts from "typescript";

export default definePlugin({
  name: "postgres-js",
  package: "@ts-safeql/plugin-postgres-js",
  setup() {
    return {
      connectionDefaults: {
        targets: [{ tag: "sql", transform: "{type}[]" }],
      },
      onTarget,
      onExpression,
    };
  },
});

type StaticValue =
  | undefined
  | null
  | string
  | number
  | boolean
  | bigint
  | StaticValue[]
  | { [key: string]: StaticValue };

function onTarget({
  node,
  context,
}: {
  node: TSESTree.TaggedTemplateExpression;
  context: TargetContext;
}): TargetMatch | false | undefined {
  const tsNode = context.parser.esTreeNodeToTSNodeMap.get(node);

  if (!ts.isTaggedTemplateExpression(tsNode)) {
    return undefined;
  }

  if (!isTypeScriptPostgresTag(tsNode.tag, context.checker)) {
    return undefined;
  }

  if (isTypeScriptNestedFragment(tsNode) || isTypeScriptFragmentVariable(tsNode, context.checker)) {
    return false;
  }

  return {};
}

function onExpression({
  context,
}: {
  node: TSESTree.Expression;
  context: { checker: ts.TypeChecker; precedingSQL: string; tsNode: ts.Node };
}): string | false | undefined {
  return buildTypeScriptExpressionSQL(context.tsNode, context.checker, context.precedingSQL);
}

const unresolvedValue = Symbol("unresolvedValue");

function buildTypeScriptExpressionSQL(
  node: ts.Node,
  checker: ts.TypeChecker,
  precedingSQL: string,
): string | false | undefined {
  const expression = unwrapTypeScriptExpression(node);

  if (ts.isTaggedTemplateExpression(expression) && isTypeScriptPostgresTag(expression.tag, checker)) {
    return buildTypeScriptTemplateSQL(expression.template, checker);
  }

  if (ts.isIdentifier(expression)) {
    const initializer = findTypeScriptInitializer(expression, checker);

    if (!initializer) {
      return undefined;
    }

    return buildTypeScriptExpressionSQL(initializer, checker, precedingSQL);
  }

  if (!ts.isCallExpression(expression) || !isTypeScriptPostgresHelperCall(expression, checker)) {
    return undefined;
  }

  if (isTypeScriptTypedHelperCall(expression)) {
    return "$N";
  }

  if (isTypeScriptUnsafeHelperCall(expression)) {
    return buildTypeScriptUnsafeHelperSQL(expression, checker);
  }

  return buildTypeScriptDynamicHelperSQL(expression, checker, precedingSQL);
}

function buildTypeScriptTemplateSQL(
  template: ts.NoSubstitutionTemplateLiteral | ts.TemplateExpression,
  checker: ts.TypeChecker,
): string | false {
  if (ts.isNoSubstitutionTemplateLiteral(template)) {
    return template.text;
  }

  let sql = template.head.text;

  for (const span of template.templateSpans) {
    const expressionSQL = buildTypeScriptExpressionSQL(span.expression, checker, sql);

    if (expressionSQL === false) {
      return false;
    }

    if (typeof expressionSQL === "string") {
      sql += expressionSQL;
    } else {
      sql += "$N";
    }

    sql += span.literal.text;
  }

  return sql;
}

function buildTypeScriptUnsafeHelperSQL(
  call: ts.CallExpression,
  checker: ts.TypeChecker,
): string | undefined {
  const value = getTypeScriptStaticValue(call.arguments[0], checker);

  if (typeof value !== "string") {
    return undefined;
  }

  return value;
}

function buildTypeScriptDynamicHelperSQL(
  call: ts.CallExpression,
  checker: ts.TypeChecker,
  precedingSQL: string,
): string | undefined {
  const helperKind = getHelperKind(precedingSQL);
  const firstValue = getTypeScriptStaticValue(call.arguments[0], checker);
  const columnNames = getTypeScriptColumnNames(call.arguments.slice(1), checker);

  if (typeof firstValue === "string") {
    if (columnNames.length > 0) {
      return escapeIdentifiers([firstValue, ...columnNames]);
    }

    return escapeIdentifier(firstValue);
  }

  if (firstValue === unresolvedValue) {
    return undefined;
  }

  if (helperKind === "insert") {
    return buildInsertHelperSQL(firstValue, columnNames);
  }

  if (helperKind === "update") {
    return buildUpdateHelperSQL(firstValue, columnNames);
  }

  if (helperKind === "in") {
    return buildInHelperSQL(firstValue);
  }

  if (helperKind === "values") {
    return buildValuesHelperSQL(firstValue);
  }

  if (helperKind === "select" || helperKind === "as" || helperKind === "returning") {
    return buildSelectHelperSQL(firstValue, columnNames);
  }

  if (isStringArray(firstValue)) {
    return escapeIdentifiers(firstValue);
  }

  return undefined;
}

function getTypeScriptColumnNames(
  nodes: readonly ts.Expression[],
  checker: ts.TypeChecker,
): string[] {
  if (nodes.length === 0) {
    return [];
  }

  if (nodes.length === 1) {
    const value = getTypeScriptStaticValue(nodes[0], checker);

    if (isStringArray(value)) {
      return value;
    }
  }

  const names: string[] = [];

  for (const node of nodes) {
    const value = getTypeScriptStaticValue(node, checker);

    if (typeof value !== "string") {
      return [];
    }

    names.push(value);
  }

  return names;
}

function getTypeScriptStaticValue(
  node: ts.Node | undefined,
  checker: ts.TypeChecker,
): StaticValue | typeof unresolvedValue {
  if (!node) {
    return unresolvedValue;
  }

  const expression = unwrapTypeScriptExpression(node);

  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
  }

  if (ts.isNumericLiteral(expression)) {
    return Number(expression.text);
  }

  if (ts.isBigIntLiteral(expression)) {
    return BigInt(expression.text.replace(/n$/, ""));
  }

  if (expression.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }

  if (expression.kind === ts.SyntaxKind.FalseKeyword) {
    return false;
  }

  if (expression.kind === ts.SyntaxKind.NullKeyword) {
    return null;
  }

  if (ts.isIdentifier(expression)) {
    if (expression.text === "undefined") {
      return undefined;
    }

    const initializer = findTypeScriptInitializer(expression, checker);

    if (!initializer) {
      return unresolvedValue;
    }

    return getTypeScriptStaticValue(initializer, checker);
  }

  if (ts.isTemplateExpression(expression)) {
    let text = expression.head.text;

    for (const span of expression.templateSpans) {
      const value = getTypeScriptStaticValue(span.expression, checker);

      if (value === unresolvedValue || Array.isArray(value) || isStaticRecord(value)) {
        return unresolvedValue;
      }

      text += String(value);
      text += span.literal.text;
    }

    return text;
  }

  if (ts.isArrayLiteralExpression(expression)) {
    const values: StaticValue[] = [];

    for (const element of expression.elements) {
      if (ts.isSpreadElement(element)) {
        return unresolvedValue;
      }

      const value = getTypeScriptStaticValue(element, checker);

      if (value === unresolvedValue) {
        return unresolvedValue;
      }

      values.push(value);
    }

    return values;
  }

  if (!ts.isObjectLiteralExpression(expression)) {
    return unresolvedValue;
  }

  const entries: Record<string, StaticValue> = {};

  for (const property of expression.properties) {
    if (!ts.isPropertyAssignment(property)) {
      return unresolvedValue;
    }

    const key = getTypeScriptPropertyName(property.name);

    if (!key) {
      return unresolvedValue;
    }

    const value = getTypeScriptStaticValue(property.initializer, checker);

    if (value === unresolvedValue) {
      return unresolvedValue;
    }

    entries[key] = value;
  }

  return entries;
}

function getTypeScriptPropertyName(node: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) {
    return node.text;
  }

  return undefined;
}

function unwrapTypeScriptExpression(node: ts.Node): ts.Node {
  if (
    ts.isAsExpression(node) ||
    ts.isParenthesizedExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isTypeAssertionExpression(node)
  ) {
    return unwrapTypeScriptExpression(node.expression);
  }

  return node;
}

function isTypeScriptNestedFragment(node: ts.TaggedTemplateExpression): boolean {
  return ts.isTemplateSpan(node.parent);
}

function isTypeScriptPostgresTag(node: ts.Node, checker: ts.TypeChecker): boolean {
  const rootIdentifier = getTypeScriptRootIdentifier(node);

  if (!rootIdentifier) {
    return false;
  }

  return isTypeScriptPostgresSqlIdentifier(rootIdentifier, checker);
}

function isTypeScriptPostgresHelperCall(
  node: ts.CallExpression,
  checker: ts.TypeChecker,
): boolean {
  const rootIdentifier = getTypeScriptRootIdentifier(node.expression);

  if (!rootIdentifier) {
    return false;
  }

  return isTypeScriptPostgresSqlIdentifier(rootIdentifier, checker);
}

function isTypeScriptTypedHelperCall(node: ts.CallExpression): boolean {
  return getTypeScriptMemberNames(node.expression).includes("typed");
}

function isTypeScriptUnsafeHelperCall(node: ts.CallExpression): boolean {
  const memberNames = getTypeScriptMemberNames(node.expression);
  return memberNames[memberNames.length - 1] === "unsafe";
}

function getTypeScriptMemberNames(node: ts.Node): string[] {
  const expression = unwrapTypeScriptExpression(node);

  if (ts.isIdentifier(expression)) {
    return [expression.text];
  }

  if (ts.isPropertyAccessExpression(expression)) {
    return [...getTypeScriptMemberNames(expression.expression), expression.name.text];
  }

  return [];
}

function getTypeScriptRootIdentifier(node: ts.Node): ts.Identifier | undefined {
  const expression = unwrapTypeScriptExpression(node);

  if (ts.isIdentifier(expression)) {
    return expression;
  }

  if (ts.isPropertyAccessExpression(expression)) {
    return getTypeScriptRootIdentifier(expression.expression);
  }

  if (ts.isCallExpression(expression)) {
    return getTypeScriptRootIdentifier(expression.expression);
  }

  return undefined;
}

function isTypeScriptPostgresSqlIdentifier(
  identifier: ts.Identifier,
  checker: ts.TypeChecker,
): boolean {
  const initializer = findTypeScriptInitializer(identifier, checker);

  if (initializer && isTypeScriptPostgresSqlInitializer(initializer, checker)) {
    return true;
  }

  const type = checker.getTypeAtLocation(identifier);
  const typeText = checker.typeToString(type);

  if (["Sql<", "TransactionSql<", "ReservedSql<"].some((text) => typeText.startsWith(text))) {
    return true;
  }

  if (hasTypeScriptPostgresSymbol(type, checker)) {
    return true;
  }

  if (hasTypeScriptPostgresSymbol(checker.getApparentType(type), checker)) {
    return true;
  }

  return isTypeScriptTransactionSqlParameter(identifier, checker);
}

function hasTypeScriptPostgresSymbol(type: ts.Type, checker: ts.TypeChecker): boolean {
  const symbols = [type.symbol, type.aliasSymbol].filter((symbol): symbol is ts.Symbol => symbol !== undefined);

  for (const symbol of symbols) {
    if (!isSymbolFromModule(checker, symbol, "postgres")) {
      continue;
    }

    if (["Sql", "TransactionSql", "ReservedSql"].includes(symbol.getName())) {
      return true;
    }
  }

  return false;
}

function isTypeScriptPostgresSqlInitializer(
  node: ts.Node,
  checker: ts.TypeChecker,
): boolean {
  const expression = unwrapTypeScriptExpression(node);

  if (ts.isIdentifier(expression)) {
    return isTypeScriptPostgresSqlIdentifier(expression, checker);
  }

  if (!ts.isCallExpression(expression)) {
    return false;
  }

  const rootIdentifier = getTypeScriptRootIdentifier(expression.expression);

  if (!rootIdentifier) {
    return false;
  }

  if (isTypeScriptIdentifierFromModule(rootIdentifier, checker, "postgres")) {
    return true;
  }

  if (
    ts.isPropertyAccessExpression(expression.expression) &&
    expression.expression.name.text === "reserve"
  ) {
    return isTypeScriptPostgresTag(expression.expression.expression, checker);
  }

  return false;
}

function isTypeScriptIdentifierFromModule(
  identifier: ts.Identifier,
  checker: ts.TypeChecker,
  moduleName: string,
): boolean {
  const symbol = checker.getSymbolAtLocation(identifier);

  for (const declaration of symbol?.declarations ?? []) {
    const importDeclaration = getTypeScriptImportDeclaration(declaration);

    if (
      importDeclaration &&
      ts.isStringLiteral(importDeclaration.moduleSpecifier) &&
      importDeclaration.moduleSpecifier.text === moduleName
    ) {
      return true;
    }
  }

  return false;
}

function isTypeScriptTransactionSqlParameter(
  identifier: ts.Identifier,
  checker: ts.TypeChecker,
): boolean {
  const symbol = checker.getSymbolAtLocation(identifier);
  const resolved = symbol && (symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol);

  for (const declaration of resolved?.declarations ?? []) {
    if (!ts.isParameter(declaration)) {
      continue;
    }

    const functionNode = declaration.parent;

    if (
      !ts.isArrowFunction(functionNode) &&
      !ts.isFunctionExpression(functionNode) &&
      !ts.isFunctionDeclaration(functionNode)
    ) {
      continue;
    }

    if (!functionNode.parent || !ts.isCallExpression(functionNode.parent)) {
      continue;
    }

    const callExpression = functionNode.parent;

    if (
      !ts.isPropertyAccessExpression(callExpression.expression) ||
      !["begin", "savepoint"].includes(callExpression.expression.name.text)
    ) {
      continue;
    }

    if (isTypeScriptPostgresTag(callExpression.expression.expression, checker)) {
      return true;
    }
  }

  return false;
}

function getTypeScriptImportDeclaration(node: ts.Declaration): ts.ImportDeclaration | undefined {
  if (ts.isImportClause(node) && ts.isImportDeclaration(node.parent)) {
    return node.parent;
  }

  if (ts.isImportSpecifier(node)) {
    const importDeclaration = node.parent.parent.parent;

    if (ts.isImportDeclaration(importDeclaration)) {
      return importDeclaration;
    }
  }

  if (ts.isNamespaceImport(node)) {
    const importDeclaration = node.parent.parent.parent;

    if (ts.isImportDeclaration(importDeclaration)) {
      return importDeclaration;
    }
  }

  return undefined;
}

function isSymbolFromModule(
  checker: ts.TypeChecker,
  symbol: ts.Symbol | undefined,
  moduleName: string,
): boolean {
  if (!symbol) {
    return false;
  }

  const resolved = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;

  for (const declaration of resolved.declarations ?? []) {
    if (declaration.getSourceFile().fileName.includes(`/${moduleName}/`)) {
      return true;
    }
  }

  return false;
}

function findTypeScriptInitializer(
  identifier: ts.Identifier,
  checker: ts.TypeChecker,
): ts.Expression | undefined {
  const symbol = checker.getSymbolAtLocation(identifier);
  const resolved = symbol && (symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol);

  for (const declaration of resolved?.declarations ?? []) {
    if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
      return declaration.initializer;
    }

    if (ts.isBindingElement(declaration) && declaration.initializer) {
      return declaration.initializer;
    }
  }

  return undefined;
}

function isTypeScriptFragmentVariable(
  node: ts.TaggedTemplateExpression,
  checker: ts.TypeChecker,
): boolean {
  const parent = node.parent;

  if (!ts.isVariableDeclaration(parent) || parent.initializer !== node) {
    return false;
  }

  if (!ts.isIdentifier(parent.name)) {
    return false;
  }

  return isTypeScriptInterpolatedAsFragment(parent.name, checker);
}

function isTypeScriptInterpolatedAsFragment(
  identifier: ts.Identifier,
  checker: ts.TypeChecker,
): boolean {
  const symbol = resolveTypeScriptSymbol(checker.getSymbolAtLocation(identifier), checker);

  if (!symbol) {
    return false;
  }

  const fragmentSymbol = symbol;
  let found = false;

  function visit(node: ts.Node) {
    if (found) {
      return;
    }

    if (ts.isTaggedTemplateExpression(node) && isTypeScriptPostgresTag(node.tag, checker)) {
      if (containsTypeScriptFragmentReference(node.template, fragmentSymbol, checker)) {
        found = true;
        return;
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(identifier.getSourceFile());
  return found;
}

function containsTypeScriptFragmentReference(
  template: ts.NoSubstitutionTemplateLiteral | ts.TemplateExpression,
  symbol: ts.Symbol,
  checker: ts.TypeChecker,
): boolean {
  if (ts.isNoSubstitutionTemplateLiteral(template)) {
    return false;
  }

  return template.templateSpans.some((span) =>
    containsTypeScriptIdentifier(span.expression, symbol, checker),
  );
}

function containsTypeScriptIdentifier(
  node: ts.Node,
  symbol: ts.Symbol,
  checker: ts.TypeChecker,
): boolean {
  let found = false;

  function visit(current: ts.Node) {
    if (found) {
      return;
    }

    if (ts.isIdentifier(current)) {
      const currentSymbol = resolveTypeScriptSymbol(checker.getSymbolAtLocation(current), checker);

      if (currentSymbol === symbol) {
        found = true;
        return;
      }
    }

    ts.forEachChild(current, visit);
  }

  visit(node);
  return found;
}

function resolveTypeScriptSymbol(
  symbol: ts.Symbol | undefined,
  checker: ts.TypeChecker,
): ts.Symbol | undefined {
  if (!symbol) {
    return undefined;
  }

  return symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
}

function buildSelectHelperSQL(
  value: StaticValue,
  columnNames: string[],
): string | undefined {
  if (typeof value === "string") {
    if (columnNames.length > 0) {
      return escapeIdentifiers([value, ...columnNames]);
    }

    return escapeIdentifier(value);
  }

  if (isStringArray(value)) {
    return escapeIdentifiers(value);
  }

  if (!isStaticRecord(value)) {
    return undefined;
  }

  const names = columnNames.length > 0 ? columnNames : Object.keys(value);

  return names.map((name) => `$N AS ${escapeIdentifier(name)}`).join(", ");
}

function buildInsertHelperSQL(
  value: StaticValue,
  columnNames: string[],
): string | undefined {
  const rows = getObjectRows(value);

  if (!rows) {
    return undefined;
  }

  const names = columnNames.length > 0 ? columnNames : Object.keys(rows[0]);
  const values = rows
    .map(() => `(${names.map(() => "$N").join(", ")})`)
    .join(", ");

  return `(${escapeIdentifiers(names)}) values ${values}`;
}

function buildUpdateHelperSQL(
  value: StaticValue,
  columnNames: string[],
): string | undefined {
  if (!isStaticRecord(value)) {
    return undefined;
  }

  const names = columnNames.length > 0 ? columnNames : Object.keys(value);

  return names.map((name) => `${escapeIdentifier(name)} = $N`).join(", ");
}

function buildInHelperSQL(value: StaticValue): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  if (value.length === 0) {
    return "(null)";
  }

  return `(${value.map(() => "$N").join(", ")})`;
}

function buildValuesHelperSQL(value: StaticValue): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  if (value.length === 0) {
    return "()";
  }

  if (value.every(Array.isArray)) {
    return value.map((row) => `(${row.map(() => "$N").join(", ")})`).join(", ");
  }

  return `(${value.map(() => "$N").join(", ")})`;
}

function getObjectRows(value: StaticValue): Array<Record<string, StaticValue>> | undefined {
  if (isStaticRecord(value)) {
    return [value];
  }

  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  if (!value.every(isStaticRecord)) {
    return undefined;
  }

  return value;
}

function getHelperKind(precedingSQL: string):
  | "insert"
  | "update"
  | "in"
  | "values"
  | "select"
  | "as"
  | "returning"
  | undefined {
  const matches = [
    findLastKeyword(precedingSQL, "insert"),
    findLastKeyword(precedingSQL, "update"),
    findLastKeyword(precedingSQL, "in"),
    findLastKeyword(precedingSQL, "values"),
    findLastKeyword(precedingSQL, "select"),
    findLastKeyword(precedingSQL, "as"),
    findLastKeyword(precedingSQL, "returning"),
  ].filter((match): match is { name: NonNullable<ReturnType<typeof findLastKeyword>>["name"]; index: number } => match !== undefined);

  if (matches.length === 0) {
    return undefined;
  }

  matches.sort((left, right) => left.index - right.index);
  return matches[matches.length - 1].name;
}

function findLastKeyword(
  text: string,
  keyword: "insert" | "update" | "in" | "values" | "select" | "as" | "returning",
): { name: typeof keyword; index: number } | undefined {
  const pattern = new RegExp(`(?:^|[\\s(])${keyword}(?:$|[\\s(])`, "gi");
  let match = pattern.exec(text);
  let index: number | undefined;

  while (match) {
    index = match.index;
    match = pattern.exec(text);
  }

  if (index === undefined) {
    return undefined;
  }

  return { name: keyword, index };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isStaticRecord(value: unknown): value is Record<string, StaticValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeIdentifiers(names: string[]): string {
  return names.map(escapeIdentifier).join(", ");
}

function escapeIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""').replace(/\./g, '"."')}"`;
}
