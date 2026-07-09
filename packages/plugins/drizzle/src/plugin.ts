import type { TSESTree } from "@typescript-eslint/utils";
import { ast, definePlugin, type TargetContext, type TargetMatch } from "@ts-safeql/plugin-utils";
import ts from "typescript";

export default definePlugin({
  name: "drizzle",
  package: "@ts-safeql/plugin-drizzle",
  setup() {
    return {
      onTarget,
      onExpression,
    };
  },
});

// Methods that consume a `sql` tag as a runnable query (validate the tag).
const querySinkMethods = new Set(["execute", "all", "get", "run", "values"]);

// Methods that consume a `sql` tag as a *fragment* (skip — not a standalone query).
const fragmentMethods = new Set([
  "where",
  "having",
  "and",
  "or",
  "not",
  "on",
  "orderBy",
  "groupBy",
  "set",
  "leftJoin",
  "rightJoin",
  "innerJoin",
  "fullJoin",
  "as",
  "mapWith",
]);

function onTarget({
  node,
  context,
}: {
  node: TSESTree.TaggedTemplateExpression;
  context: TargetContext;
}): TargetMatch | false | undefined {
  const tsNode = context.parser.esTreeNodeToTSNodeMap.get(node);

  if (!tsNode || !ts.isTaggedTemplateExpression(tsNode)) {
    return undefined;
  }

  if (!isDrizzleTag(tsNode.tag, context.checker)) {
    return undefined;
  }

  return isStandaloneQuery(tsNode) ? {} : false;
}

function onExpression({
  context,
}: {
  node: TSESTree.Expression;
  context: { checker: ts.TypeChecker; precedingSQL: string; tsNode: ts.Node; tsType: ts.Type };
}): string | false | undefined {
  return buildExpressionSQL(context.tsNode, context.tsType, context.checker);
}

// A `sql` tag is standalone unless it's a fragment; when unsure, treat as a fragment (skip) to avoid validating a snippet.
function isStandaloneQuery(tsNode: ts.TaggedTemplateExpression): boolean {
  if (tsNode.parent && ts.isTemplateSpan(tsNode.parent)) {
    return false;
  }

  let current: ts.Node = tsNode;
  let parent = current.parent;

  while (parent) {
    // `.as(...)` / `.mapWith(...)` etc. mark a fragment, never a query.
    if (ts.isPropertyAccessExpression(parent) && parent.expression === current) {
      if (fragmentMethods.has(parent.name.text)) {
        return false;
      }
      current = parent;
      parent = current.parent;
      continue;
    }

    if (
      (ts.isAwaitExpression(parent) ||
        ts.isParenthesizedExpression(parent) ||
        ts.isAsExpression(parent) ||
        ts.isNonNullExpression(parent)) &&
      getInnerExpression(parent) === current
    ) {
      current = parent;
      parent = current.parent;
      continue;
    }

    break;
  }

  // As a call argument: a query sink (`db.execute(sql`...`)`) validates; anything else is a fragment.
  if (
    parent !== undefined &&
    ts.isCallExpression(parent) &&
    parent.arguments.some((arg) => arg === current)
  ) {
    const method = ts.isPropertyAccessExpression(parent.expression)
      ? parent.expression.name.text
      : undefined;

    if (method !== undefined && querySinkMethods.has(method)) {
      return true;
    }

    return false;
  }

  return true;
}

function getInnerExpression(node: ts.Node): ts.Node | undefined {
  if (
    ts.isAwaitExpression(node) ||
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isNonNullExpression(node)
  ) {
    return node.expression;
  }
  return undefined;
}

function buildExpressionSQL(
  node: ts.Node,
  tsType: ts.Type,
  checker: ts.TypeChecker,
): string | false | undefined {
  const expression = ast.unwrap({ node: node });

  if (ts.isTaggedTemplateExpression(expression) && isDrizzleTag(expression.tag, checker)) {
    return buildTemplateSQL(expression.template, checker);
  }

  if (ts.isCallExpression(expression) && isDrizzleHelperCall(expression, checker)) {
    return buildHelperSQL(expression, checker);
  }

  // Only a primitive value becomes a bound param; a column/table object (`${users.id}`) isn't reconstructible.
  if (isPrimitiveValueType(tsType)) {
    return undefined;
  }

  return false;
}

function buildHelperSQL(call: ts.CallExpression, checker: ts.TypeChecker): string | false {
  const method = ts.isPropertyAccessExpression(call.expression)
    ? call.expression.name.text
    : undefined;

  switch (method) {
    case "raw": {
      const value = getStaticString(call.arguments[0], checker);
      return value === ast.UNRESOLVED ? false : value;
    }

    case "identifier": {
      const value = getStaticString(call.arguments[0], checker);
      return value === ast.UNRESOLVED ? false : quoteIdentifier(value);
    }

    case "placeholder":
      return "$N";

    default:
      return false;
  }
}

function buildTemplateSQL(
  template: ts.NoSubstitutionTemplateLiteral | ts.TemplateExpression,
  checker: ts.TypeChecker,
): string | false {
  if (ts.isNoSubstitutionTemplateLiteral(template)) {
    return template.text;
  }

  let sql = template.head.text;

  for (const span of template.templateSpans) {
    const tsType = checker.getTypeAtLocation(span.expression);
    const resolved = buildExpressionSQL(span.expression, tsType, checker);
    if (resolved === false) return false;
    sql += typeof resolved === "string" ? resolved : "$N";
    sql += span.literal.text;
  }

  return sql;
}

function isPrimitiveValueType(type: ts.Type): boolean {
  const constituents = type.isUnion() ? type.types : [type];
  const valueFlags =
    ts.TypeFlags.StringLike |
    ts.TypeFlags.NumberLike |
    ts.TypeFlags.BooleanLike |
    ts.TypeFlags.BigIntLike |
    ts.TypeFlags.Null |
    ts.TypeFlags.Undefined;

  return constituents.every((member) => (member.flags & valueFlags) !== 0);
}

function isDrizzleTag(node: ts.Node, checker: ts.TypeChecker): boolean {
  return ast.isImportedFrom({ node: node, checker: checker, moduleName: "drizzle-orm" });
}

function isDrizzleHelperCall(call: ts.CallExpression, checker: ts.TypeChecker): boolean {
  return ts.isPropertyAccessExpression(call.expression) && isDrizzleTag(call.expression, checker);
}

function getStaticString(
  node: ts.Node | undefined,
  checker: ts.TypeChecker,
): string | typeof ast.UNRESOLVED {
  const value = ast.getStaticValue({ node: node, checker: checker });
  return typeof value === "string" ? value : ast.UNRESOLVED;
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
