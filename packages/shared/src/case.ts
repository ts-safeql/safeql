import { assertNever } from "./common";

export type IdentiferCase = "snake" | "camel" | "pascal" | "screaming snake";

export function toCase(str: string, caseType: IdentiferCase | undefined): string {
  switch (caseType) {
    case undefined:
      return str;
    case "snake":
      return toSnakeCase(str);
    case "camel":
      return toCamelCase(str);
    case "pascal":
      return toPascalCase(str);
    case "screaming snake":
      return toScreamingSnakeCase(str);
    default:
      assertNever(caseType);
  }
}

export function toCamelCase(str: string) {
  return str.replace(/([-_][a-z])/gi, ($1) => {
    return $1.toUpperCase().replace("-", "").replace("_", "");
  });
}

export function toPascalCase(str: string) {
  return toCamelCase(str).replace(/^[a-z]/, (val) => val.toUpperCase());
}

export function toSnakeCase(str: string) {
  return str
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();
}

export function toScreamingSnakeCase(str: string) {
  return toSnakeCase(str).toUpperCase();
}
