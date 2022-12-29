import postgres from "postgres";

export function check() {
  const sql = postgres();

  sql<{ id: number }[]>`SELECT id FROM starship`;

  /**
   * This is possible due to `overrides.types = { date: "Date" }` in the config file.
   */
  sql<{ id: number }[]>`SELECT id FROM person WHERE birth_date < ${new Date()}`;
}
