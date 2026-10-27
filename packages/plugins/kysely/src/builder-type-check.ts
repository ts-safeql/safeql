import type { TSESTree } from "@typescript-eslint/utils";
import type {
  IncorrectTypeAnnotationReport,
  PluginResolvedTarget,
  ResolvedQueryTypeCheckContext,
} from "@ts-safeql/plugin-utils";
import ts from "typescript";

export type TypedBuilderFragment =
  | { kind: "column"; alias: string; tag: ts.TaggedTemplateExpression }
  | { kind: "condition"; tag: ts.TaggedTemplateExpression };

const BOOLEAN: PluginResolvedTarget = { kind: "type", value: "boolean" };

export function createBuilderTypeCheck(
  fragments: TypedBuilderFragment[],
): (ctx: ResolvedQueryTypeCheckContext) => IncorrectTypeAnnotationReport[] | undefined {
  return (ctx) => {
    const reports = fragments
      .map((fragment) => checkFragment(fragment, ctx))
      .filter((report): report is IncorrectTypeAnnotationReport => report !== undefined);

    return reports.length > 0 ? reports : undefined;
  };
}

function checkFragment(
  fragment: TypedBuilderFragment,
  ctx: ResolvedQueryTypeCheckContext,
): IncorrectTypeAnnotationReport | undefined {
  const tag: TSESTree.Node | undefined = ctx.parser.tsNodeToESTreeNodeMap.get(fragment.tag);
  if (tag === undefined || tag.type !== "TaggedTemplateExpression") {
    return undefined;
  }

  const typeParameter = tag.typeArguments;
  const annotation = typeParameter?.params[0];
  if (typeParameter === undefined || annotation === undefined) {
    return undefined;
  }

  const actual = actualTypeOf(fragment, ctx.output);
  const expected = expectedTypeOf(fragment, annotation, ctx);
  if (actual === null || expected === null || isEqualIgnoringQuoteStyle(expected, actual, ctx)) {
    return undefined;
  }

  return {
    kind: "incorrect-type-annotation",
    typeParameter,
    expected: ctx.getComparableString(expected),
    actual: ctx.getComparableString(actual),
  };
}

function actualTypeOf(
  fragment: TypedBuilderFragment,
  output: PluginResolvedTarget | null,
): PluginResolvedTarget | null {
  if (fragment.kind === "condition") {
    return BOOLEAN;
  }

  if (output?.kind !== "object") {
    return null;
  }

  return output.value.find(([key]) => key === fragment.alias)?.[1] ?? null;
}

function expectedTypeOf(
  fragment: TypedBuilderFragment,
  annotation: TSESTree.TypeNode,
  ctx: ResolvedQueryTypeCheckContext,
): PluginResolvedTarget | null {
  if (fragment.kind === "condition" && isBooleanAnnotation(annotation, ctx)) {
    return BOOLEAN;
  }

  return ctx.resolveExpectedType(annotation);
}

function isBooleanAnnotation(
  annotation: TSESTree.TypeNode,
  ctx: ResolvedQueryTypeCheckContext,
): boolean {
  const tsNode = ctx.parser.esTreeNodeToTSNodeMap.get(annotation);
  return isBooleanType(ctx.checker.getTypeAtLocation(tsNode));
}

function isBooleanType(type: ts.Type): boolean {
  if ((type.flags & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral)) !== 0) {
    return true;
  }

  return type.isUnionOrIntersection() && type.types.some(isBooleanType);
}

function isEqualIgnoringQuoteStyle(
  expected: PluginResolvedTarget,
  actual: PluginResolvedTarget,
  ctx: ResolvedQueryTypeCheckContext,
): boolean {
  const canonical = (target: PluginResolvedTarget) =>
    ctx.getComparableString(target).replace(/'/g, '"');
  return canonical(expected) === canonical(actual);
}
