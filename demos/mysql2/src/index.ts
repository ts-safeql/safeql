import mysql from "mysql2/promise";
import { sql as SafeQLTag } from "@ts-safeql/sql-tag";

function createMySQLSqlTag(connection: mysql.Connection) {
  return async <TValue>(
    template: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<TValue> => {
    const tag = SafeQLTag(template, ...values);
    const [rows] = await connection.query(tag.query, tag.values);
    return rows as TValue;
  };
}

export async function run() {
  const connection = await mysql.createConnection({
    host: "localhost",
    port: 3307,
    user: "root",
    password: "rootpass",
    database: "safeql_mysql2_demo",
  });

  const sql = createMySQLSqlTag(connection);

  try {
    // Basic query - select id from person
    await sql<{ id: number }[]>`SELECT id FROM person`;

    // Multiple columns - select id and name
    await sql<{ id: number; name: string }[]>`SELECT id, name FROM person`;

    // ENUM type query - mood column should be typed as union
    await sql<{ id: number; name: string; mood: "sad" | "ok" | "happy" }[]>`
      SELECT id, name, mood FROM person
    `;

    // Type alias usage
    type PersonIdName = {
      id: number;
      name: string;
    };
    await sql<PersonIdName[]>`SELECT id, name FROM person`;

    // Interface usage
    interface PersonIdNameInterface {
      id: number;
      name: string;
    }
    await sql<PersonIdNameInterface[]>`SELECT id, name FROM person`;

    // All columns - including TIMESTAMP
    await sql<{
      id: number;
      name: string;
      mood: "sad" | "ok" | "happy";
      created_at: Date;
    }[]>`SELECT id, name, mood, created_at FROM person`;

    // Starship table query
    await sql<{ id: number; name: string }[]>`SELECT id, name FROM starship`;

    // JOIN query example
    interface StarshipWithCaptain {
      starship_id: number;
      starship_name: string;
      captain_name: string;
    }
    await sql<StarshipWithCaptain[]>`
      SELECT
        s.id as starship_id,
        s.name as starship_name,
        p.name as captain_name
      FROM starship s
      JOIN person p ON s.captain_id = p.id
    `;

    // TIMESTAMP column only
    await sql<{ created_at: Date }[]>`SELECT created_at FROM person`;

    // captain_id column query
    await sql<{ id: number; captain_id: number }[]>`
      SELECT id, captain_id FROM starship
    `;

    // GROUP_CONCAT example
    await sql<{ id: number; name: string; starships: any }[]>`
      SELECT
        person.id,
        person.name,
        GROUP_CONCAT(starship.name) as starships
      FROM person
        LEFT JOIN starship ON starship.captain_id = person.id
      GROUP BY
        person.id, person.name
    `;

    console.log("✅ All queries executed successfully!");
  } finally {
    await connection.end();
  }
}

run();
