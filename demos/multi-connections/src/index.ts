import { Db, Nullable } from "@safeql-demos/shared/client";
import postgres from "postgres";

export function check(client1: Db, client2: Db) {
  const sql = postgres();

  client1.queryOne<{ id: number; post_id: Nullable<number>; body: Nullable<string> }>(sql`
    SELECT * FROM comments
  `);

  client2.queryOne<{ id: number; name: Nullable<string> }>(sql`
    SELECT * FROM chat_rooms
  `);
}
