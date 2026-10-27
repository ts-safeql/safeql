import assert from "assert";
import { describe, test } from "vitest";
import { deepMergeDefaults } from "./common";

describe("deepMergeDefaults", () => {
  test("never overwrites values already present in the target", () => {
    assert.deepEqual(deepMergeDefaults({ a: 1 }, { a: 2, b: 3 }), { a: 1, b: 3 });
  });

  test("fills undefined target values from the defaults", () => {
    assert.deepEqual(deepMergeDefaults({ a: undefined }, { a: 2 }), { a: 2 });
  });

  test("merges nested plain objects recursively", () => {
    assert.deepEqual(deepMergeDefaults({ a: { x: 1 } }, { a: { x: 2, y: 3 } }), {
      a: { x: 1, y: 3 },
    });
  });

  test("does not merge arrays", () => {
    assert.deepEqual(deepMergeDefaults({ a: [1] }, { a: [2, 3] }), { a: [1] });
  });
});
