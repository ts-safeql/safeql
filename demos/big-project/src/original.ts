import postgres from "postgres";

interface Starship {
  id: number;
  name: string;
  captain_id: number | null;
}

export function check() {
  const sql = postgres();

  sql<{ id: number }[]>`SELECT id FROM starship`;
  sql<{ id: number; name: string; captain_id: number | null }[]>`SELECT * FROM starship`;
  sql<Starship[]>`SELECT * FROM starship`;
}
