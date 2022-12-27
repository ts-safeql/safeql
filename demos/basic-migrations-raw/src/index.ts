import { Db } from "@ts-safeql-demos/shared/client";
import postgres from "postgres";

export function check(client: Db) {
  const sql = postgres();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client.queryOne<{ id: number; post_id: number | null; metadata: any; body: string | null }>(sql`
  SELECT * FROM comments
  `);
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client.queryOne<{ id: number; post_id: number | null; metadata: any; body: string | null }>(sql`
    SELECT * FROM comments
  `);
}
