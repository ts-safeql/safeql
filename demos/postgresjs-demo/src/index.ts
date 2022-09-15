import postgres from "postgres";

export async function check() {
  const sql = postgres();

  sql<{ id: number }[]>`SELECT id FROM person`;
}
