import { describe, expect, it } from "vitest";
import { ExpectedResolvedTarget } from "../../utils/get-resolved-target-by-type-node";
import { ResolvedTarget } from "@ts-safeql/generate";
import { getResolvedTargetsEquality, getResolvedTargetComparableString } from "../check-sql.utils";

describe("check-sql.utils type comparison", () => {
  it("considers both expected and generated unknown as equal", () => {
    const result = getResolvedTargetsEquality({
      expected: null,
      generated: null,
      nullAsOptional: false,
      nullAsUndefined: false,
      inferLiterals: false,
    });

    expect(result).toEqual({
      isEqual: true,
      expected: null,
      generated: null,
    });
  });

  it("returns false when one side is missing", () => {
    const expected: ExpectedResolvedTarget = {
      kind: "type",
      value: "number",
    };

    const generated: ResolvedTarget = {
      kind: "type",
      value: "number",
      type: "number",
    };

    expect(
      getResolvedTargetsEquality({
        expected,
        generated: null,
        nullAsOptional: false,
        nullAsUndefined: false,
        inferLiterals: false,
      }).isEqual,
    ).toBe(false);

    expect(
      getResolvedTargetsEquality({
        expected: null,
        generated,
        nullAsOptional: false,
        nullAsUndefined: false,
        inferLiterals: false,
      }).isEqual,
    ).toBe(false);
  });

  it("normalizes object properties before comparison", () => {
    const expected: ExpectedResolvedTarget = {
      kind: "object",
      value: [["id", { kind: "type", value: "number" }]],
    };

    const generated: ResolvedTarget = {
      kind: "object",
      value: [["id", { kind: "type", value: "number", type: "number" }]],
    };

    expect(
      getResolvedTargetsEquality({
        expected,
        generated,
        nullAsOptional: false,
        nullAsUndefined: false,
        inferLiterals: false,
      }),
    ).toMatchObject({
      isEqual: true,
    });
  });

  it("applies transform before comparing generated vs expected", () => {
    const expected: ExpectedResolvedTarget = {
      kind: "type",
      value: "string",
    };

    const generated: ResolvedTarget = {
      kind: "type",
      value: "text",
      type: "text",
    };

    const transformed = getResolvedTargetsEquality({
      expected,
      generated,
      nullAsOptional: false,
      nullAsUndefined: false,
      inferLiterals: false,
      transform: [["text", "string"]],
    });

    expect(transformed).toMatchObject({ isEqual: true });
    expect(
      getResolvedTargetComparableString({
        target: transformed.expected!,
        nullAsOptional: false,
        nullAsUndefined: false,
        inferLiterals: false,
      }),
    ).toBe("string");
  });

  it("returns deterministic stringified types for array/object comparisons", () => {
    const expected: ExpectedResolvedTarget = {
      kind: "array",
      value: { kind: "type", value: "number" },
    };

    const generated: ResolvedTarget = {
      kind: "array",
      value: { kind: "type", value: "number", type: "number" },
    };

    expect(
      getResolvedTargetComparableString({
        target: expected,
        nullAsOptional: false,
        nullAsUndefined: false,
        inferLiterals: false,
      }),
    ).toBe("number[]");
    expect(
      getResolvedTargetComparableString({
        target: generated,
        nullAsOptional: false,
        nullAsUndefined: false,
        inferLiterals: false,
      }),
    ).toBe("number[]");
  });
});
