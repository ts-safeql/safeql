import { minimatch } from "minimatch";

export function doesMatchPattern(params: { pattern: string | { regex: string }; text: string }) {
  const { pattern, text } = params;

  if (typeof pattern === "string") {
    return minimatch(text, pattern);
  }

  return new RegExp(`^${pattern.regex}$`).test(text);
}
