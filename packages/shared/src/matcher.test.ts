import assert from "assert";
import { describe, test } from "vitest";
import { doesMatchPattern } from "./matcher";

describe("doesMatchPattern", () => {
  test.each([
    ["sql*", "sqlQuery", true],
    ["sql*", "other", false],
    ["{sql,query}*", "queryUsers", true],
    ["{sql,query}*", "other", false],
    ["sql?", "sql1", true],
    ["sql?", "sql12", false],
  ])("matches glob %s against %s", (pattern, text, expected) => {
    assert.equal(doesMatchPattern({ pattern, text }), expected);
  });

  test.each([
    ["sql.*", "sqlQuery", true],
    ["sql.*", "prefixsqlQuery", false],
  ])("anchors regex %s against %s", (regex, text, expected) => {
    assert.equal(doesMatchPattern({ pattern: { regex }, text }), expected);
  });
});
