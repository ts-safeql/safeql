import postgres from "postgres";

const sql = postgres();

const bt = 5;

export const personColsFrag = sql`
    id, name
`;

const q = sql<{ id: number; name: string; }[]>`
    SELECT ${personColsFrag}
    FROM
      starship
    GROUP BY ${personColsFrag}
  `;
