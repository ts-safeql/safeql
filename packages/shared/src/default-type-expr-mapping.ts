const numericTypes = ["int4", "int8", "float8"] as const;
type NumericType = (typeof numericTypes)[number];

const arithmeticOps = ["+", "-", "*", "/", "%"] as const;
const comparisonOps = ["=", "<>", "<", "<=", ">", ">="] as const;

function promoteNumeric(left: NumericType, right: NumericType): NumericType {
  if (left === "float8" || right === "float8") return "float8";
  if (left === "int8" || right === "int8") return "int8";
  return "int4";
}

function defineArithmeticForOp(op: string) {
  const result: Record<string, string> = {};
  for (const l of numericTypes) {
    for (const r of numericTypes) {
      const key = `${l} ${op} ${r}`;
      result[key] = promoteNumeric(l, r);
    }
  }
  return result;
}

function defineComparisonOps(ops: readonly string[]) {
  const result: Record<string, string> = {};
  for (const op of ops) {
    for (const l of numericTypes) {
      for (const r of numericTypes) {
        const key = `${l} ${op} ${r}`;
        result[key] = "bool";
      }
    }
  }
  return result;
}

function defineTextComparisons(ops: readonly string[]) {
  const result: Record<string, string> = {};
  for (const op of ops) {
    const key = `text ${op} text`;
    result[key] = "bool";
  }
  return result;
}

export const defaultTypeExprMapping: Record<string, string> = (() => {
  const arithmeticMap: Record<string, string> = {};
  for (const op of arithmeticOps) {
    Object.assign(arithmeticMap, defineArithmeticForOp(op));
  }

  const comparisonMap = defineComparisonOps(comparisonOps);
  const textComparisonMap = defineTextComparisons(comparisonOps);

  const caretMap: Record<string, string> = {};
  for (const l of numericTypes) {
    for (const r of numericTypes) {
      const key = `${l} ^ ${r}`;
      caretMap[key] = "float8";
    }
  }

  const textRegexMap: Record<string, string> = {
    "text ~~ text": "bool", // LIKE
    "text ~~* text": "bool", // ILIKE
    "text !~~ text": "bool", // NOT LIKE
    "text !~~* text": "bool", // NOT ILIKE

    "text ~ text": "bool", // Regex match (case-sensitive)
    "text !~ text": "bool", // Regex not match (case-sensitive)
    "text ~* text": "bool", // Regex match (case-insensitive)
    "text !~* text": "bool", // Regex not match (case-insensitive)
  };

  const miscMap: Record<string, string> = {
    "text || text": "text",
    "array || array": "array",
    "array && array": "bool",
    "range && range": "bool",
  };

  const bitwiseMap: Record<string, string> = {
    // int4
    "int4 << int4": "int4",
    "int4 >> int4": "int4",
    "int4 & int4": "int4",
    "int4 | int4": "int4",
    "int4 # int4": "int4",

    // int8
    "int8 << int8": "int8",
    "int8 >> int8": "int8",
    "int8 & int8": "int8",
    "int8 | int8": "int8",
  };

  const rangeMap: Record<string, string> = {
    "range << range": "bool", // strictly left
    "range >> range": "bool", // strictly right
    "range -|- range": "bool", // adjacency
  };

  // 9) JSONB / array containment, JSON key operators
  const jsonMap: Record<string, string> = {
    // Contains
    "jsonb @> jsonb": "bool",
    "array @> array": "bool",

    // Contained by
    "jsonb <@ jsonb": "bool",
    "array <@ array": "bool",

    // JSON key existence checks
    "jsonb ? text": "bool",
    "jsonb ?| array": "bool",
    "jsonb ?& array": "bool",

    // JSONB access
    "jsonb -> text": "jsonb", // key access -> jsonb
    "jsonb ->> text": "text", // key access -> text
    "jsonb #> array": "jsonb", // path access -> jsonb
    "jsonb #>> array": "text", // path access -> text
    "jsonb #- text": "jsonb", // remove key/element -> jsonb
  };

  // Merge all partial maps into one
  return Object.assign(
    {},
    arithmeticMap,
    comparisonMap,
    textComparisonMap,
    caretMap,
    textRegexMap,
    miscMap,
    bitwiseMap,
    rangeMap,
    jsonMap,
  );
})();
