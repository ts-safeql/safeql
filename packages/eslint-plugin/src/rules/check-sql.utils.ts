import { GenerateResult } from "@ts-safeql/generate";

type TypeReplacerString = string;
type TypeReplacerFromTo = [string, string];
type TypeTransformer = TypeReplacerString | (TypeReplacerString | TypeReplacerFromTo)[];

function isReplacerFromTo(replacer: TypeTransformer[number]): replacer is TypeReplacerFromTo {
  return Array.isArray(replacer) && replacer.length === 2;
}

function transformType(typeString: string, typeReplacer: TypeTransformer[number]): string {
  return isReplacerFromTo(typeReplacer)
    ? typeString.replace(new RegExp(typeReplacer[0], "g"), typeReplacer[1])
    : typeReplacer.replace("${type}", typeString);
}

/**
 * Takes a generated result and a transform type and returns a result with the
 * transformed type.
 *
 * @param transform could be either:
 *  - a string that has ${type} in it,
 *  - an array of tuples that behave as [valueToBeReplaced, typeToReplaceWith]
 *  - an array that has a mix of the above (such as ["${type}[]", ["Nullable", "Maybe"]])
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
