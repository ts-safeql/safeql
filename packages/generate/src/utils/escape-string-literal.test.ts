import { describe, expect, it } from "vitest";
import { escapeStringLiteral } from "./escape-string-literal";

describe("escapeStringLiteral", () => {
  it.each([
    { name: "plain text", input: "plain", expected: "plain" },
    { name: "backslashes", input: "a\\b", expected: "a\\\\b" },
    { name: "single quotes", input: "it's", expected: "it\\'s" },
    { name: "line feeds", input: "line\nbreak", expected: "line\\nbreak" },
    { name: "carriage returns", input: "carriage\rreturn", expected: "carriage\\rreturn" },
    { name: "tabs", input: "tab\tchar", expected: "tab\\tchar" },
    { name: "nul bytes", input: "nul\0char", expected: "nul\\x00char" },
    { name: "other control characters", input: "bell\x07", expected: "bell\\x07" },
  ])("escapes $name", ({ input, expected }) => {
    expect(escapeStringLiteral(input)).toBe(expected);
  });
});
