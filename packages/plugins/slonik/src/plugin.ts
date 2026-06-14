import type { TSESTree } from "@typescript-eslint/utils";
import { ast, definePlugin, type ExpressionContext } from "@ts-safeql/plugin-utils";
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
        const rootId = ast.estree.getRootIdentifier({ node: node.tag });
        if (!rootId) return undefined;

        const tsNode = context.parser.esTreeNodeToTSNodeMap.get(rootId);
        const symbol = tsNode ? context.checker.getSymbolAtLocation(tsNode) : undefined;
        if (!ast.isSymbolImportedFrom({ checker: context.checker, symbol, moduleName: "slonik" }))
          return undefined;

        switch (ast.estree.getMethodName({ node: node.tag })) {
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

function translateCallExpression(
  node: TSESTree.Expression,
  tsNode: ts.Node,
  checker: ts.TypeChecker,
): string | false | undefined {
  if (node.type !== "CallExpression") return undefined;
  if (!isSlonikCallExpression(tsNode, checker)) return undefined;

  const method = ast.estree.getMethodName({ node });
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

  const parts = ast.estree.getStringLiterals({ nodes: arg.elements });
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

  const current = ast.unwrap({ node: tsNode });
  return ts.isCallExpression(current) && isSlonikFragmentExpression(current.arguments[1], checker)
    ? "$N"
    : false;
}

function translateUnnestCall(arg: TSESTree.CallExpressionArgument | undefined): string | false {
  if (arg?.type !== "ArrayExpression") return false;

  const parts = ast.estree.getStringLiterals({ nodes: arg.elements });
  if (!parts) return false;

  const types = parts.map((part) => `$N::${part}[]`);

  return types.length > 0 ? `unnest(${types.join(", ")})` : false;
}

function isFragmentTokenType(context: ExpressionContext): boolean {
  if (context.tsTypeText.includes("FragmentSqlToken")) {
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
  const expression = ast.unwrap({ node: node });

  if (ts.isIdentifier(expression)) {
    return resolveIdentifierFragmentSql(expression, checker, visited);
  }

  if (ts.isTaggedTemplateExpression(expression)) {
    return ast.getMethodName({ node: expression.tag }) === "fragment" &&
      isSlonikMethod(expression.tag, checker)
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

function isSlonikCallExpression(node: ts.Node, checker: ts.TypeChecker): boolean {
  const current = ast.unwrap({ node: node });
  return ts.isCallExpression(current) && isSlonikMethod(current.expression, checker);
}

function isSlonikFragmentExpression(node: ts.Node, checker: ts.TypeChecker): boolean {
  const current = ast.unwrap({ node: node });
  return ts.isTaggedTemplateExpression(current)
    ? ast.getMethodName({ node: current.tag }) === "fragment" &&
        isSlonikMethod(current.tag, checker)
    : false;
}

function resolveIdentifierFragmentSql(
  node: ts.Identifier,
  checker: ts.TypeChecker,
  visited: Set<ts.Symbol>,
): string | false | undefined {
  const symbol = checker.getSymbolAtLocation(node);
  if (!symbol) return undefined;

  const candidates = ast.getSymbolCandidates({ checker: checker, symbol: symbol });
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

    const initializer = ast.getBindingInitializer({ element: declaration });
    if (!initializer) continue;

    const resolved = resolveFragmentSql(initializer, checker, new Set(nextVisited));
    if (resolved !== undefined) return resolved;
  }

  return undefined;
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
  const method = ast.getMethodName({ node });
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
  return ast.isImportedFrom({ node: node, checker: checker, moduleName: "slonik" });
}

function translateTsIdentifierCall(arg: ts.Expression | undefined): string | false {
  if (!arg || !ts.isArrayLiteralExpression(arg)) return false;

  const parts = ast.getStringLiterals({ nodes: arg.elements });
  return parts ? joinIdentifierPath(parts) : false;
}
