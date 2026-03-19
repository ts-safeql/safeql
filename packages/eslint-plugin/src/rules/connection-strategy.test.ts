import os from "os";
import { describe, it, expect } from "vitest";
import { getConnectionStartegyByRuleOptionConnection } from "./check-sql.utils";

describe("connection strategy resolution", () => {
  it("plugins coexist with databaseUrl — connection uses databaseUrl", () => {
    // ARRANGE
    const connection = {
      databaseUrl: "postgres://localhost:5432/test",
      plugins: [{ package: "some-plugin", config: {} }],
      targets: [{ tag: "sql" as const }],
    };

    // ACT
    const strategy = getConnectionStartegyByRuleOptionConnection({
      connection,
      projectDir: os.tmpdir(),
    });

    // ASSERT
    expect(strategy.type).toBe("databaseUrl");
    expect(strategy.plugins).toEqual([{ package: "some-plugin", config: {} }]);
  });
});
