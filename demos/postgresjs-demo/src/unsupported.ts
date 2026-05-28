import postgres from "postgres";
import { example, section } from "./demo";

const sql = postgres();

type Mood = "sad" | "ok" | "happy";

type PersonRow = {
  id: number;
  name: string;
  mood: Mood;
};

const shouldFilterCaptain = true;
const captainId = 1 as number | undefined;

section("Unsupported postgres.js fragments", () => {
  example("conditional fragment selection", () => {
    void sql<PersonRow[]>`
      SELECT *
      FROM person
      WHERE name IS NOT NULL ${shouldFilterCaptain ? sql`AND id > ${1}` : sql``}
    `;
  });

  example("inline dynamic filter", () => {
    void sql<PersonRow[]>`
      SELECT *
      FROM person
      ${captainId ? sql`WHERE id = ${captainId}` : sql``}
    `;
  });

  const fallbackId = undefined as number | undefined;

  example("sql function fallback", () => {
    void sql<PersonRow[]>`
      SELECT *
      FROM person
      WHERE id = ${fallbackId || sql`1`}
    `;
  });
});

section("Unsupported postgres.js ordering and transforms", () => {
  const ordering = {
    name: "asc",
    id: "desc",
  } as const;

  example("array-built ordering", () => {
    void sql<{ id: number; name: string; captain_id: number | null }[]>`
      SELECT *
      FROM starship
      ORDER BY ${Object.entries(ordering).flatMap(([column, direction], index) => [
        index ? sql`,` : sql``,
        sql`${sql(column)} ${direction === "desc" ? sql`DESC` : sql`ASC`}`,
      ])}
    `;
  });

  const camelSql = postgres({ transform: postgres.camel });

  example("transform-aware identifiers", () => {
    void camelSql<{ captainId: number | null }[]>`
      SELECT ${camelSql("captainId")}
      FROM starship
    `;
  });
});

section("Unsupported postgres.js multiple statements", () => {
  example("multiple statements with simple", () => {
    void sql`SELECT 1; SELECT 2;`.simple();
  });
});
