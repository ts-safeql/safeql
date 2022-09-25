import postgres from "postgres";

type Nullable<T> = T | null;

interface Starship {
  id: number;
  name: string;
  captain_id: Nullable<number>;
}

export function check() {
  const sql = postgres();

  sql<{ id: number }[]>`SELECT id FROM starship`;
  sql<{ id: number; name: string; captain_id: Nullable<number> }[]>`SELECT * FROM starship`;
  sql<Starship[]>`SELECT * FROM starship`;
}
