import postgres from "postgres";

type ID = number;

export async function check(idsFromParameter: ID[]) {
  const sql = postgres();

  await sql<{ id: number }[]>`
    SELECT id
    FROM person
    WHERE TRUE
        AND id = ${idsFromParameter[0] > 5 ? 5 : 5}
        AND id = ANY(${idsFromParameter})
        AND name = ${"John"} -- string literal
    `;

  // Conditional expression
  await sql<{ id: number }[]>`SELECT id FROM starship WHERE id = ${
    idsFromParameter[0] > 5 ? 5 : 5
  }`;

  // Nullish coalescing operator
  const x = 5 as number | null;
  await sql<{ id: number }[]>`SELECT id FROM starship WHERE id = ${x ?? 10}`;

  interface AgencyIdNameType {
    id: number;
    name: string;
  }

  await sql<AgencyIdNameType[]>`SELECT id, name FROM person`;

  interface AgencyIdNameInterface {
    id: number;
    name: string;
  }

  await sql<AgencyIdNameInterface[]>`SELECT id, name FROM person`;
  await sql<{ id: number; name: string }[]>`SELECT id, name FROM person`;

  await sql.end();
}
