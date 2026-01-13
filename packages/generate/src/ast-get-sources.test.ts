import * as parser from "libpg-query";
import { describe, expect, test } from "vitest";
import { getSources } from "./ast-get-sources";
import { FlattenedRelationWithJoins } from "./utils/get-relations-with-joins";
import { PgColRow } from "./generate";

describe("getSources", () => {
  test("inherits subselect sources for RangeVar lookup", async () => {
    const outerParsed = await parser.parse(`SELECT val FROM foo`);
    const outerSelect = outerParsed.stmts[0]?.stmt?.SelectStmt;

    const subselectParsed = await parser.parse(`SELECT 1 AS val`);
    const subselect = subselectParsed.stmts[0]?.stmt?.SelectStmt;

    if (!outerSelect || !subselect) {
      throw new Error("Expected SelectStmt");
    }

    const pgColsBySchemaAndTableName = new Map<string, Map<string, PgColRow[]>>([
      ["public", new Map()],
    ]);
    const relations: FlattenedRelationWithJoins[] = [];

    const subselectResolver = getSources({
      select: subselect,
      relations,
      nonNullableColumns: new Set<string>(),
      pgColsBySchemaAndTableName,
    });

    const prevSources = new Map([
      ["foo", { kind: "subselect", name: "foo", sources: subselectResolver } as const],
    ]);

    const resolver = getSources({
      select: outerSelect,
      relations,
      prevSources,
      nonNullableColumns: new Set<string>(),
      pgColsBySchemaAndTableName,
    });

    expect(resolver.sources.get("foo")?.kind).toBe("subselect");
  });
});
