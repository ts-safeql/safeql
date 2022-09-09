import postgres from "postgres";
import { Db } from "@ts-safeql-demos/shared/client";

type ID = number;

export function check(client: Db, idsFromParameter: ID[]) {
  const sql = postgres();

  client.query<{ id: number; name: string }>(sql`
    SELECT *
    FROM person
    WHERE TRUE
        AND id = ANY(${idsFromParameter})
        AND name = ${"John"} -- string literal
  `);
}
