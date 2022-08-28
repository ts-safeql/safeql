import postgres from "postgres";

function createClient() {
  async function queryOne<T>(query: postgres.PendingQuery<postgres.Row[]>) {
    const results = await query;

    if (results.length !== 1) {
      throw new Error(`Expected one result, got ${results.length}`);
    }

    return results[0];
  }

  return { queryOne };
}

type Unknown<T> = T | undefined;

async function main() {
  const sql = postgres("postgres://postgres:postgres@localhost:5432/medflyt_test_sim");

  const conn = createClient();

  const result = conn.queryOne<{ id: number; assoc_id: number; }>(sql`
    SELECT
        caregiver.id,
        caregiver_agency_assoc.id as assoc_id
    FROM
        caregiver
            JOIN caregiver_agency_assoc ON caregiver.id = caregiver_agency_assoc.caregiver
  `)


  await sql.end();
}

main();
