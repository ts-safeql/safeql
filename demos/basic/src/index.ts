import postgres from "postgres";
import { Db } from "@safeql-demos/shared/client";

type ID = number;

export function check(client: Db, idsFromParameter: ID[]) {
  const sql = postgres();

  client.queryOne<{ id: number }>(sql`
    SELECT id
    FROM caregiver
    WHERE TRUE
        AND id = ANY(${idsFromParameter})
        AND "firstName" = ${"John"} -- string literal
  `);
}
