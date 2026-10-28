import { describe, expect, it } from "vitest";
import { ExpectedResolvedTarget } from "../../utils/get-resolved-target-by-type-node";
import { ResolvedTarget } from "@ts-safeql/generate";
import {
  getResolvedTargetsEquality,
  getResolvedTargetComparableString,
  getResolvedTargetString,
} from "../check-sql.utils";

describe("check-sql.utils type comparison", () => {
  it.each([
    { override: "Date | number", members: ["Date", "null", "number"] },
    { override: "(number | Date)", members: ["number", "Date", "null"] },
    { override: "string | number", members: ["string", "null", "number"] },
    { override: "'a | b' | number", members: ["'a | b'", "null", "number"] },
    {
      override: "Array<string | null> | number",
      members: ["Array<string | null>", "null", "number"],
    },
    {
      override: "(() => string | number) | Date",
      members: ["(() => string | number)", "null", "Date"],
    },
  ])(
    "flattens a nullable union override without splitting nested syntax: $override",
    ({ override, members }) => {
      const expected: ExpectedResolvedTarget = {
        kind: "object",
        value: [
          [
            "value",
            {
              kind: "union",
              value: members.map((value) => ({ kind: "type", value })),
            },
          ],
        ],
      };
      const generated: ResolvedTarget = {
        kind: "object",
        value: [
          [
            "value",
            {
              kind: "union",
              value: [
                { kind: "type", value: override, type: "custom" },
                { kind: "type", value: "null", type: "null" },
              ],
            },
          ],
        ],
      };
      expect(
        getResolvedTargetsEquality({
          expected,
          generated,
          nullAsOptional: false,
          nullAsUndefined: false,
          inferLiterals: false,
        }).isEqual,
      ).toBe(true);
    },
  );

  it("keeps narrower temporal annotations incorrect", () => {
    const generated: ResolvedTarget = {
      kind: "union",
      value: [
        { kind: "type", value: "Date | number", type: "timestamptz" },
        { kind: "type", value: "null", type: "null" },
      ],
    };
    for (const value of ["Date", "Date | number", "Date | null"]) {
      expect(
        getResolvedTargetsEquality({
          expected: { kind: "type", value },
          generated,
          nullAsOptional: false,
          nullAsUndefined: false,
          inferLiterals: false,
        }).isEqual,
      ).toBe(false);
    }
  });

  it("preserves the precedence of union-valued array elements", () => {
    const generated: ResolvedTarget = {
      kind: "array",
      value: { kind: "type", value: "Date | number", type: "timestamptz" },
    };
    const options = { nullAsOptional: false, nullAsUndefined: false, inferLiterals: false };
    expect(getResolvedTargetString({ target: generated, ...options })).toBe("(Date | number)[]");
    expect(
      getResolvedTargetsEquality({
        expected: {
          kind: "array",
          value: {
            kind: "union",
            value: [
              { kind: "type", value: "Date" },
              { kind: "type", value: "number" },
            ],
          },
        },
        generated,
        ...options,
      }).isEqual,
    ).toBe(true);
    expect(
      getResolvedTargetsEquality({
        expected: {
          kind: "union",
          value: [
            { kind: "type", value: "Date" },
            { kind: "array", value: { kind: "type", value: "number" } },
          ],
        },
        generated,
        ...options,
      }).isEqual,
    ).toBe(false);
  });

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

  it("treats `any` nested in a literal base as compatible", () => {
    const expected: ExpectedResolvedTarget = {
      kind: "literal",
      value: '"a"',
      base: { kind: "type", value: "any" },
    };

    const generated: ResolvedTarget = {
      kind: "literal",
      value: '"a"',
      base: { kind: "type", value: "string", type: "string" },
    };

    expect(
      getResolvedTargetsEquality({
        expected,
        generated,
        nullAsOptional: false,
        nullAsUndefined: false,
        inferLiterals: false,
      }),
    ).toMatchObject({ isEqual: true });
  });

  it("treats a union containing `any` as `any`, since TypeScript collapses `any | T` to `any`", () => {
    const expected: ExpectedResolvedTarget = { kind: "type", value: "string" };

    const generated: ResolvedTarget = {
      kind: "union",
      value: [
        { kind: "type", value: "any", type: "jsonb" },
        { kind: "type", value: "null", type: "null" },
      ],
    };

    expect(
      getResolvedTargetsEquality({
        expected,
        generated,
        nullAsOptional: false,
        nullAsUndefined: false,
        inferLiterals: false,
      }),
    ).toMatchObject({ isEqual: true });
  });

  it("still reports a mismatched union member next to a member containing `any`", () => {
    const expected: ExpectedResolvedTarget = {
      kind: "union",
      value: [
        {
          kind: "array",
          value: { kind: "object", value: [["data", { kind: "type", value: "string" }]] },
        },
        { kind: "type", value: "number" },
      ],
    };

    const generated: ResolvedTarget = {
      kind: "union",
      value: [
        {
          kind: "array",
          value: {
            kind: "object",
            value: [["data", { kind: "type", value: "any", type: "jsonb" }]],
          },
        },
        { kind: "type", value: "null", type: "null" },
      ],
    };

    expect(
      getResolvedTargetsEquality({
        expected,
        generated,
        nullAsOptional: false,
        nullAsUndefined: false,
        inferLiterals: false,
      }),
    ).toMatchObject({ isEqual: false });
  });

  it("returns the original targets, not the `any`-normalized ones, for the error message", () => {
    const expected: ExpectedResolvedTarget = { kind: "type", value: "string" };
    const generated: ResolvedTarget = { kind: "type", value: "any", type: "jsonb" };

    const result = getResolvedTargetsEquality({
      expected,
      generated,
      nullAsOptional: false,
      nullAsUndefined: false,
      inferLiterals: false,
    });

    expect(result.isEqual).toBe(true);
    expect(result.expected).toBe(expected);
    expect(result.generated).toBe(generated);
  });
});
