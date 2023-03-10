import postgres from "postgres";
import { Db } from "@ts-safeql-demos/shared/client";

type ID = number;

export function check(client: Db, idsFromParameter: ID[]) {
  const sql = postgres();

  client.query<{ id: number }>(sql`
    SELECT id
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

  type AgencyIdNameType = { id: number; name: string };
  client.query<AgencyIdNameType>(sql`SELECT id, name FROM person`);

  interface AgencyIdNameInterface {
    id: number;
    name: string;
  }
  client.query<AgencyIdNameInterface>(sql`SELECT id, name FROM person`);
  client.query<{ id: number; name: string }>(sql`SELECT id, name FROM person`);
}
