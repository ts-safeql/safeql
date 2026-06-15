import type { TSESTree } from "@typescript-eslint/utils";
import { ast, definePlugin, type TargetContext, type TargetMatch } from "@ts-safeql/plugin-utils";
import ts from "typescript";

/**
 * Validates Drizzle's `sql` template tag (`import { sql } from "drizzle-orm"`)
 * and its statically resolvable helpers (`sql.raw`, `sql.identifier`,
 * `sql.placeholder`, nested fragments). Drizzle's fluent query builder
 * (`db.select().from(...)`) and column-object interpolation are out of scope
 * and skipped.
 */
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

/**
 * A drizzle `sql` tag is a standalone query unless it is a nested fragment, a
 * `.as()` selection, or an argument to a fragment-producing method. Anything we
 * are unsure about is treated as a fragment (skip) to avoid validating a
 * partial SQL snippet.
 */
function isStandaloneQuery(tsNode: ts.TaggedTemplateExpression): boolean {
  // Nested inside another template (`sql\`... ${sql\`...\`} ...\``).
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

  // Passed as an argument to a call: `db.execute(sql\`...\`)` validates;
  // `qb.where(sql\`...\`)` is a fragment.
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

    // Unknown/fragment method consuming the tag → not a standalone query.
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

  // Nested drizzle `sql` fragment — splice its SQL in.
  if (ts.isTaggedTemplateExpression(expression) && isDrizzleTag(expression.tag, checker)) {
    return buildTemplateSQL(expression.template, checker);
  }

  if (ts.isCallExpression(expression) && isDrizzleHelperCall(expression, checker)) {
    return buildHelperSQL(expression, checker);
  }

  // A plain interpolated value (`${id}`) becomes a bound parameter. Only allow
  // it when its type is a primitive value — a Drizzle column/table object
  // (`${users.id}`) resolves to identifiers we cannot reconstruct statically.
  if (isPrimitiveValueType(tsType)) {
    return undefined; // SafeQL emits the default `$N` placeholder.
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
