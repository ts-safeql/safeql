import postgres from "postgres";

export async function queryUsers() {
  const sql = postgres();

  const users = await sql<{ id: number }[]>`SELECT 1 as id`;

  await sql.end();
  return users;
}
