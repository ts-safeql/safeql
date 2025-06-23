import { Db } from "@ts-safeql-demos/shared/client";
import postgres from "postgres";

/**
 * Executes sample queries on the database client to select from the `comments` table and insert into the `test_date_columns` table.
 *
 * Performs two identical select queries on the `comments` table and one insert query into the `test_date_columns` table, primarily for testing or demonstration purposes.
 */
export function check(client: Db) {
  const sql = postgres();

  client.queryOne<{
    id: number;
    post_id: number | null;
    metadata: any | null;
    body: string | null;
  }>(sql`
    SELECT * FROM comments
  `);

  client.queryOne<{
    id: number;
    post_id: number | null;
    metadata: any | null;
    body: string | null;
  }>(sql`
    SELECT * FROM comments
  `);

  client.query<{
    id: number;
    date_local: Date | null;
    date_utc: Date | null;
    just_date: Date | null;
  }>(sql`
    INSERT INTO test_date_columns (date_local, date_utc, just_date)
    VALUES (${new Date()}, ${new Date()}, ${new Date()})
    RETURNING *
  `);
}
