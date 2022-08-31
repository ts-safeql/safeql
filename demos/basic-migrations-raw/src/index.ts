import { Db, Nullable } from "@safeql-demos/shared/client";
import postgres from "postgres";

export function check(client: Db) {
  const sql = postgres();

  client.queryOne<{ id: number; post_id: Nullable<number>; body: Nullable<string> }>(sql`
    SELECT * FROM comments
  `);
}
