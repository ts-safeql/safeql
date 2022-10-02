import postgres from "postgres";

export function check() {
  const sql = postgres();

  sql<{ id: number }[]>`SELECT id FROM starship`;
}
