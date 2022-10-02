import { Db } from "@ts-safeql-demos/shared/client";
import postgres from "postgres";

export function check(client1: Db, client2: Db) {
  const sql = postgres();

  // client 1 points to acme/migrations1/
  client1.queryOne<{ post_id: number | null; }>(sql`SELECT post_id FROM comments`);

  // client 2 points to acme/migrations2/
  client2.queryOne<{ name: string | null; }>(sql`SELECT name  FROM chat_rooms`);
}
