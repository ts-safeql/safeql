import postgres from "postgres";

export async function check(id: number) {
  const sql = postgres();

  sql<{ id: number }[]>`SELECT id FROM person`;
  sql<{ id: number }[]>`SELECT id FROM person WHERE id = ${id}`;
}
