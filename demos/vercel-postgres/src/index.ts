import { db, sql } from "@vercel/postgres";

export async function check() {
  const client = await db.connect();

  const result = await client.sql<{ id: number; name: string }>`
    SELECT * FROM person WHERE id = 1
  `;

  const result2 = await sql<{ id: number }>`
    SELECT id FROM starship
  `;

  console.log(result, result2);
}
