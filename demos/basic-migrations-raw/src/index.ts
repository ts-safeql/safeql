import postgres from "postgres";
import { Db } from "@safeql-demos/shared/client";

export function check(client: Db, firstName: string) {
  const sql = postgres();

  client.queryOne<{ id: number }>(sql` 
    SELECT id FROM comments WHERE "firstName" = ${firstName}
  `);

  client.queryOne<{ id: number; firstName: string }>(sql`
        SELECT id, "firstName"
        FROM caregiver
        WHERE
            "firstName" = ${firstName}
    `);
}
