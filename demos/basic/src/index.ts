import postgres from "postgres";
import { Db } from "@ts-safeql-demos/shared/client";

type ID = number;

export function check(client: Db, idsFromParameter: ID[]) {
  const sql = postgres();

  client.query<{ id: number; name: string }>(sql`
    SELECT *
    FROM person
    WHERE TRUE
        AND id = ${idsFromParameter[0] > 5 ? 5 : 5}
        AND id = ANY(${idsFromParameter})
        AND name = ${"John"} -- string literal
  `);

  // Conditional expression
  client.query<{ id: number }>(sql`
    SELECT id FROM starship WHERE id = ${idsFromParameter[0] > 5 ? 5 : 5}
  `);

  const x: number | null = 5;

  client.query<{ id: number }>(sql`
    SELECT id FROM starship WHERE id = ${x ?? 10}
  `);
}
