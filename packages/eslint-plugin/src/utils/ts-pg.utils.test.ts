import { describe, expect, it } from "vitest";
import { replacePluginPlaceholders } from "./ts-pg.utils";

describe("replacePluginPlaceholders", () => {
  it("replaces bare plugin placeholders", () => {
    expect(replacePluginPlaceholders("$N::jsonb, unnest($N::int4[])", 0)).toEqual({
      text: "$1::jsonb, unnest($2::int4[])",
      nextIndex: 2,
    });
  });

  it("leaves quoted literals and comments untouched", () => {
    expect(replacePluginPlaceholders(`'$N' || $N /* $N */ -- $N\n"$N" || $N`, 1)).toEqual({
      text: `'$N' || $2 /* $N */ -- $N\n"$N" || $3`,
      nextIndex: 3,
    });
  });

  it("leaves dollar-quoted bodies untouched", () => {
    expect(replacePluginPlaceholders("$$$N$$ || $N || $tag$$N$tag$", 0)).toEqual({
      text: "$$$N$$ || $1 || $tag$$N$tag$",
      nextIndex: 1,
    });
  });

  it("does not rewrite placeholder-like identifiers", () => {
    expect(replacePluginPlaceholders("$Nfoo || $N", 4)).toEqual({
      text: "$Nfoo || $5",
      nextIndex: 5,
    });
  });
});
