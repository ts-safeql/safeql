import * as LibPgQueryAST from "@ts-safeql/sql-ast";
import { InternalError } from "@ts-safeql/shared";
import assert from "assert";
import { taskEither } from "fp-ts";
import { flow, identity, pipe } from "fp-ts/lib/function";
import parser from "libpg-query";
import { test } from "vitest";
import { getRelationsWithJoins } from "./get-relations-with-joins";

const cases: {
  query: string;
  only?: boolean;
  expected: [
    string,
    {
      alias: string | undefined;
      type: LibPgQueryAST.JoinType;
      name: string;
    }[],
  ][];
}[] = [
  {
    query: `
      SELECT *
      FROM caregiver
    `,
    expected: [],
  },
  {
    query: `
    SELECT *
    FROM
      caregiver
        LEFT JOIN agency ON caregiver.id = agency.id
    `,
    expected: [
      ["caregiver", [{ alias: undefined, name: "agency", type: LibPgQueryAST.JoinType.JOIN_LEFT }]],
    ],
  },
  {
    query: `
      SELECT
        caregiver.id as caregiver_id,
        caregiver_agency.id as assoc_id
      FROM caregiver
        LEFT JOIN caregiver_agency ON caregiver.id = caregiver_agency.caregiver_id
        LEFT JOIN agency ON caregiver_agency.agency_id = agency.id
    `,
    expected: [
      [
        "caregiver",
        [
          { alias: undefined, name: "caregiver_agency", type: LibPgQueryAST.JoinType.JOIN_LEFT },
          { alias: undefined, name: "agency", type: LibPgQueryAST.JoinType.JOIN_LEFT },
        ],
      ],
    ],
  },
  {
    query: `
      SELECT
        a.x
      FROM
        a
          FULL JOIN w ON w.id = a.w_id
          INNER JOIN x ON x.id = a.x_id
          LEFT JOIN y ON y.id = a.y_id
          RIGHT JOIN z ON z.id = a.z_id,
        b
          FULL JOIN w ON w.id = b.w_id
          INNER JOIN x ON x.id = b.x_id
          LEFT JOIN y ON y.id = b.y_id
          RIGHT JOIN z ON z.id = b.z_id,
        c
    `,
    expected: [
      [
        "a",
        [
          { alias: undefined, name: "w", type: LibPgQueryAST.JoinType.JOIN_FULL },
          { alias: undefined, name: "x", type: LibPgQueryAST.JoinType.JOIN_INNER },
          { alias: undefined, name: "y", type: LibPgQueryAST.JoinType.JOIN_LEFT },
          { alias: undefined, name: "z", type: LibPgQueryAST.JoinType.JOIN_RIGHT },
        ],
      ],
      [
        "b",
        [
          { alias: undefined, name: "w", type: LibPgQueryAST.JoinType.JOIN_FULL },
          { alias: undefined, name: "x", type: LibPgQueryAST.JoinType.JOIN_INNER },
          { alias: undefined, name: "y", type: LibPgQueryAST.JoinType.JOIN_LEFT },
          { alias: undefined, name: "z", type: LibPgQueryAST.JoinType.JOIN_RIGHT },
        ],
      ],
    ],
  },
  {
    query: `
      SELECT subselect.id
      FROM tbl
        LEFT JOIN (SELECT * FROM inner1) AS subselect1 on subselect.id = tbl.id 
        LEFT JOIN (SELECT * FROM inner2) AS subselect2 on subselect2.id = tbl.id 
        LEFT JOIN (SELECT * FROM inner3) AS subselect3 on subselect3.id = tbl.id 
    `,
    expected: [
      [
        "tbl",
        [
          { alias: undefined, name: "subselect1", type: LibPgQueryAST.JoinType.JOIN_LEFT },
          { alias: undefined, name: "subselect2", type: LibPgQueryAST.JoinType.JOIN_LEFT },
          { alias: undefined, name: "subselect3", type: LibPgQueryAST.JoinType.JOIN_LEFT },
        ],
      ],
    ],
  },
];

export const getRelationsWithJoinsTE = flow(
  parser.parse,
  taskEither.tryCatchK(identity, InternalError.to),
  taskEither.map(getRelationsWithJoins),
);

for (const { query, expected, only } of cases) {
  const tester = only ? test.only : test;
  tester(`get relations with joins: ${query}`, async () => {
    return pipe(
      getRelationsWithJoinsTE(query),
      taskEither.match(
        (error) => assert.fail(error.message),
        (result) => assert.deepEqual([...result.entries()], expected),
      ),
    )();
  });
}
