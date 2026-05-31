import { test } from "vitest";
import { setupGenerateTest } from "./generate.test-setup";

const testQuery = setupGenerateTest();

test("insert into table with returning", async () => {
  await testQuery({
    query: `INSERT INTO member (first_name, last_name) VALUES (null, null) RETURNING id`,
    expected: [["id", { kind: "type", value: "number", type: "int4" }]],
    unknownColumns: ["id"],
  });
});

test("insert into table without returning", async () => {
  await testQuery({
    query: `INSERT INTO member (first_name, last_name) VALUES (null, null)`,
    expected: null,
  });
});

test("insert into table with overridden type in RETURNING", async () => {
  await testQuery({
    options: { overrides: { types: { text: "CustomType" } } },
    query: `INSERT INTO team (name) VALUES ('overriden_type_inserted') RETURNING name`,
    expected: [["name", { kind: "type", value: "CustomType", type: "text" }]],
    unknownColumns: ["name"],
  });
});

test("update row with overridden type in RETURNING", async () => {
  await testQuery({
    options: { overrides: { types: { text: "CustomType" } } },
    query: `UPDATE team SET name = 'overriden_type_updated' WHERE name = 'overriden_type_inserted' RETURNING name`,
    expected: [["name", { kind: "type", value: "CustomType", type: "text" }]],
    unknownColumns: ["name"],
  });
});

test("delete row with overridden type in RETURNING", async () => {
  await testQuery({
    options: { overrides: { types: { text: "CustomType" } } },
    query: `DELETE FROM team WHERE name = 'overriden_type_updated' RETURNING name`,
    expected: [["name", { kind: "type", value: "CustomType", type: "text" }]],
    unknownColumns: ["name"],
  });
});

test("insert into returning overriden column", async () => {
  await testQuery({
    schema: `
      CREATE TABLE test_tbl (test_col TEXT NOT NULL);
    `,
    options: { overrides: { columns: { "test_tbl.test_col": "Overriden" } } },
    query: `INSERT INTO test_tbl (test_col) VALUES ('abc') RETURNING *`,
    expected: [["test_col", { kind: "type", value: "Overriden", type: "text" }]],
    unknownColumns: ["test_col"],
  });
});
