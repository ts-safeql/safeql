import assert from "assert";
import { test } from "mocha";
import { getLeftJoinTables } from "./getLeftJoinTables";

test("SELECT 1 as x", async () => {
  const v = await getLeftJoinTables("SELECT 1 as x");

  assert.deepEqual(v, []);
});
