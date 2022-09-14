import postgres from "postgres";

export async function check() {
  const sql = postgres();

  const q1 = await sql<{ id: number }[]>`
    SELECT id FROM person
  `;
}
