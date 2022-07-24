import postgres from "postgres";

async function main() {
  ``;
  const sql = postgres("postgres://postgres:postgres@localhost:5432/medflyt_test_sim");

  const results = await Promise.all([
    sql.unsafe(`SELECT id, "firstName", "lastName" from caregiver LIMIT 1`).describe(),
    sql.unsafe(`SELECT address from caregiver LIMIT 1`).describe(),
  ]);

  console.log(results);

  await sql.end();
}

main();
