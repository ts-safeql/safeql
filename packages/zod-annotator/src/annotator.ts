import type { ParserServices, TSESTree } from "@typescript-eslint/utils";
import {
  isAssignableTo,
  type PluginResolvedTarget,
  type TypeCheckContext,
  type TypeCheckReport,
} from "@ts-safeql/plugin-utils";
import ts from "typescript";

export interface ZodAnnotatorOptions {
  /** Index of the Zod schema argument in the call expression (default: 0). */
  schemaArgIndex?: number;
}

/**
 * Create a `typeCheck` callback that compares a Zod schema against the
 * DB-resolved output and produces an auto-fix when they diverge.
 *
 * Usage inside a plugin's `onTarget`:
 * ```ts
 * import { createZodAnnotator } from "@ts-safeql/zod-annotator";
 * return { typeCheck: createZodAnnotator() };
 * ```
 */
export function createZodAnnotator(
  options?: ZodAnnotatorOptions,
): (ctx: TypeCheckContext) => TypeCheckReport | undefined {
  const schemaArgIndex = options?.schemaArgIndex ?? 0;

  return (ctx) => {
    const { node, output, checker, parser, sourceCode } = ctx;

    if (node.tag.type !== "CallExpression") return undefined;

    const schemaArg = node.tag.arguments[schemaArgIndex];
    if (!schemaArg || schemaArg.type === "SpreadElement") return undefined;

    const expected = extractTypeFromZodSchema({ schemaExpression: schemaArg, parser, checker });
    if (!expected) return undefined;

    if (isAssignableTo(output, expected)) return undefined;

    const zodStr = resolvedTargetToZodSchema(output);
    const calleeText = sourceCode.getText(node.tag.callee);

    return {
      message: `Zod schema does not match query result.\n\tExpected: ${zodStr}`,
      node: node.tag,
      fix: { node: node.tag, text: `${calleeText}(${zodStr})` },
    };
  };
}

function extractTypeFromZodSchema(params: {
  schemaExpression: TSESTree.Expression;
  parser: ParserServices;
  checker: ts.TypeChecker;
}): PluginResolvedTarget | undefined {
  const { schemaExpression, parser, checker } = params;
  const tsNode = parser.esTreeNodeToTSNodeMap.get(schemaExpression);
  const schemaType = checker.getTypeAtLocation(tsNode);

  const outputProp = schemaType.getProperty("_output") ?? schemaType.getProperty("_type");
  if (!outputProp) return undefined;

  const inferredType = checker.getTypeOfSymbolAtLocation(outputProp, tsNode);
  if (!inferredType) return undefined;

  return tsTypeToTarget(inferredType, checker, tsNode);
}

function tsTypeToTarget(
  type: ts.Type,
  checker: ts.TypeChecker,
  node: ts.Node,
): PluginResolvedTarget {
  if (type.flags & ts.TypeFlags.String) return { kind: "type", value: "string" };
  if (type.flags & ts.TypeFlags.Number) return { kind: "type", value: "number" };
  if (type.flags & ts.TypeFlags.Boolean) return { kind: "type", value: "boolean" };
  if (type.flags & ts.TypeFlags.BigInt) return { kind: "type", value: "bigint" };
  if (type.flags & ts.TypeFlags.Null) return { kind: "type", value: "null" };
  if (type.flags & ts.TypeFlags.Undefined) return { kind: "type", value: "undefined" };
  if (type.flags & ts.TypeFlags.Any) return { kind: "type", value: "any" };
  if (type.flags & ts.TypeFlags.Unknown) return { kind: "type", value: "unknown" };

  if (type.isUnion()) {
    return {
      kind: "union",
      value: type.types.map((t) => tsTypeToTarget(t, checker, node)),
    };
  }

  if (type.flags & ts.TypeFlags.Object) {
    const objectType = type as ts.ObjectType;

    if (objectType.objectFlags & ts.ObjectFlags.Reference) {
      const typeRef = type as ts.TypeReference;
      if (typeRef.target?.symbol?.name === "Array") {
        const elementType = checker.getTypeArguments(typeRef)[0];
        if (elementType) {
          return { kind: "array", value: tsTypeToTarget(elementType, checker, node) };
        }
      }
    }

    if (type.symbol?.name === "Date") {
      return { kind: "type", value: "Date" };
    }

    const properties = type.getProperties();
    if (properties.length > 0) {
      return {
        kind: "object",
        value: properties.map((prop): [string, PluginResolvedTarget] => {
          const propType = checker.getTypeOfSymbolAtLocation(prop, node);
          return [prop.name, tsTypeToTarget(propType, checker, node)];
        }),
      };
    }
  }

  const typeString = checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation);
  return { kind: "type", value: typeString };
}

const TS_TO_ZOD: Record<string, string> = {
  number: "number()",
  string: "string()",
  boolean: "boolean()",
  bigint: "bigint()",
  Date: "date()",
  any: "any()",
  unknown: "unknown()",
  null: "null()",
  undefined: "undefined()",
  never: "never()",
  void: "void()",
};

function resolvedTargetToZodSchema(target: PluginResolvedTarget, zod = "z"): string {
  switch (target.kind) {
    case "type": {
      const zodMethod = TS_TO_ZOD[target.value];
      if (zodMethod) return `${zod}.${zodMethod}`;
      return `${zod}.any()`;
    }

    case "literal":
      return `${zod}.literal(${target.value})`;

    case "array":
      return `${zod}.array(${resolvedTargetToZodSchema(target.value, zod)})`;

    case "object": {
      const props = target.value
        .map(([key, value]) => {
          const prop = /^[$A-Z_][0-9A-Z_$]*$/i.test(key) ? key : JSON.stringify(key);
          return `${prop}: ${resolvedTargetToZodSchema(value, zod)}`;
        })
        .join(", ");
      return `${zod}.object({ ${props} })`;
    }

    case "union": {
      const nonNull = target.value.filter((x) => !(x.kind === "type" && x.value === "null"));

      if (nonNull.length === 1 && nonNull.length !== target.value.length) {
        return `${resolvedTargetToZodSchema(nonNull[0], zod)}.nullable()`;
      }

      return `${zod}.union([${target.value.map((x) => resolvedTargetToZodSchema(x, zod)).join(", ")}])`;
    }
  }
}
