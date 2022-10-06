import { GenerateResult } from "@ts-safeql/generate";
import { DuplicateColumnsError, InvalidQueryError, PostgresError } from "@ts-safeql/shared";
import { TSESTree } from "@typescript-eslint/utils";
import crypto from "crypto";
import { ESTreeUtils } from "../utils";
import { RuleContext } from "./check-sql.rule";
import { WorkerError } from "./check-sql.worker";

type TypeReplacerString = string;
type TypeReplacerFromTo = [string, string];
type TypeTransformer = TypeReplacerString | (TypeReplacerString | TypeReplacerFromTo)[];

function isReplacerFromTo(replacer: TypeTransformer[number]): replacer is TypeReplacerFromTo {
  return Array.isArray(replacer) && replacer.length === 2;
}

function transformType(typeString: string, typeReplacer: TypeTransformer[number]): string {
  return isReplacerFromTo(typeReplacer)
    ? typeString.replace(new RegExp(typeReplacer[0], "g"), typeReplacer[1])
    : typeReplacer.replace("{type}", typeString);
}

/**
 * Takes a generated result and a transform type and returns a result with the
 * transformed type.
 *
 * @param transform could be either:
 *  - a string that has {type} in it,
 *  - an array of tuples that behave as [valueToBeReplaced, typeToReplaceWith]
 *  - an array that has a mix of the above (such as ["{type}[]", ["colname", "x_colname"]])
 */
export function withTransformType(result: GenerateResult, transform?: TypeTransformer) {
  if (transform === undefined || result.result === null) {
    return result;
  }

  if (typeof transform === "string") {
    return { ...result, result: transformType(result.result, transform) };
  }

  const replacer = (() => {
    let transformed = result.result;

    for (const replacer of transform) {
      transformed = transformType(transformed, replacer);
    }

    return transformed;
  })();

  return { ...result, result: replacer };
}

export function reportInvalidQueryError(params: {
  context: RuleContext;
  error: InvalidQueryError;
}) {
  const { context, error } = params;

  return context.report({
    messageId: "invalidQuery",
    node: error.node,
    data: { error: error.message },
  });
}

export function reportBaseError(params: {
  context: RuleContext;
  tag: TSESTree.TaggedTemplateExpression;
  error: WorkerError;
}) {
  const { context, tag, error } = params;

  return context.report({
    node: tag,
    messageId: "error",
    data: {
      error: error.message,
    },
  });
}

export function reportDuplicateColumns(params: {
  tag: TSESTree.TaggedTemplateExpression;
  context: RuleContext;
  error: DuplicateColumnsError;
}) {
  const { tag, context, error } = params;

  return context.report({
    node: tag,
    messageId: "invalidQuery",
    loc: ESTreeUtils.getSourceLocationFromStringPosition({
      loc: tag.quasi.loc,
      position: error.queryText.search(error.columns[0]) + 1,
      value: error.queryText,
    }),
    data: {
      error: error.message,
    },
  });
}

export function reportPostgresError(params: {
  context: RuleContext;
  tag: TSESTree.TaggedTemplateExpression;
  error: PostgresError;
}) {
  const { context, tag, error } = params;

  return context.report({
    node: tag,
    messageId: "invalidQuery",
    loc: ESTreeUtils.getSourceLocationFromStringPosition({
      loc: tag.quasi.loc,
      position: parseInt(error.position, 10),
      value: error.queryText,
    }),
    data: {
      error: error.message,
    },
  });
}

export function reportMissingTypeAnnotations(params: {
  context: RuleContext;
  tag: TSESTree.TaggedTemplateExpression;
  baseNode: TSESTree.BaseNode;
  result: GenerateResult & { result: string };
}) {
  const { context, tag, baseNode, result } = params;

  return context.report({
    node: tag,
    messageId: "missingTypeAnnotations",
    loc: baseNode.loc,
    fix: (fixer) => fixer.insertTextAfterRange(baseNode.range, `<${result.result}>`),
    data: {
      fix: result.result,
    },
  });
}

export function reportIncorrectTypeAnnotations(params: {
  context: RuleContext;
  result: GenerateResult;
  typeParameter: TSESTree.TSTypeParameterInstantiation;
  expected: string | null;
  actual: string | null;
}) {
  const { context, result, typeParameter } = params;
  const newValue = result.result === null ? "" : `<${result.result}>`;

  return context.report({
    node: typeParameter.params[0],
    messageId: "incorrectTypeAnnotations",
    fix: (fixer) => fixer.replaceText(typeParameter, newValue),
    data: {
      expected: params.expected,
      actual: params.actual ?? "No type annotation",
    },
  });
}
export function reportInvalidTypeAnnotations(params: {
  context: RuleContext;
  typeParameter: TSESTree.TSTypeParameterInstantiation;
}) {
  const { context, typeParameter } = params;

  return context.report({
    node: typeParameter.params[0],
    messageId: "invalidTypeAnnotations",
  });
}

export function getDatabaseName(params: {
  databaseName: string | undefined;
  migrationsDir: string;
  projectDir: string;
}) {
  const { databaseName, projectDir, migrationsDir } = params;

  if (databaseName !== undefined) {
    return databaseName;
  }

  const projectDirName = projectDir.split("/").pop() ?? "";
  const projectUnderscoreName = projectDirName.replace(/[^A-z0-9]/g, "_").toLowerCase();
  const hash = crypto.createHash("sha1").update(migrationsDir).digest("hex").substring(0, 8);

  return `safeql_${projectUnderscoreName}_${hash}`;
}

export function shouldLintFile(params: RuleContext) {
  const fileName = params.getFilename();

  for (const extension of ["ts", "tsx", "mts", "mtsx"]) {
    if (fileName.endsWith(`.${extension}`)) {
      return true;
    }
  }

  return false;
}
