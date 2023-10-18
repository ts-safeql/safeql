import "reflect-metadata";

import { sql as SafeQLTag } from "@ts-safeql/sql-tag";
import { DataSource } from "typeorm";

export const AppDataSource = new DataSource({
  type: "postgres",
  host: "localhost",
  port: 5432,
  database: "safeql_typeorm",
  synchronize: true,
  entities: [__dirname + "/entity/*"],
});

function createDataSourceSqlTag(dataSource: DataSource) {
  return <TValue>(template: TemplateStringsArray, ...values: unknown[]): Promise<TValue> => {
    const tag = SafeQLTag(template, ...values);
    return dataSource.query<TValue>(tag.query, tag.values);
  };
}

const sql = createDataSourceSqlTag(AppDataSource);

async function run() {
  await AppDataSource.initialize();

  const persons = await sql<{ id: number; name: string }[]>`SELECT id, name FROM person`;

  const personStarships = await sql<{ id: number; name: string; starships: string[] | null }[]>`
    SELECT
      person.id,
      person.name,
      ARRAY_AGG(starship.name) as starships
    FROM person
      JOIN starship ON starship.captain_id = person.id
    GROUP BY
      person.id
  `;

  await AppDataSource.destroy();

  console.log(JSON.stringify({ persons, personStarships: personStarships }, null, 2));
}

run();
// Prints:
// 
// {
//   "persons": [
//     {
//       "id": 1,
//       "name": "John Doe"
//     },
//     {
//       "id": 2,
//       "name": "Jane Doe"
//     }
//   ],
//   "personStarships": [
//     {
//       "id": 1,
//       "name": "John Doe",
//       "starships": [
//         "Millennium Falcon"
//       ]
//     }
//   ]
// }