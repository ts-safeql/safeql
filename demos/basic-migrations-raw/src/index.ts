import { Db } from "@ts-safeql-demos/shared/client";
import postgres from "postgres";

export function check(client: Db) {
  const sql = postgres();

  client.queryOne<{ id: number; post_id: number | null; body: string | null }>(sql`
    SELECT * FROM comments
  `);
}
