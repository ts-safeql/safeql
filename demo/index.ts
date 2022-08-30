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

type Db = ReturnType<typeof createClient>;

type Unknown<T> = T | undefined;
type Nullable<T> = T | null;

function findByUserFirstName(db: Db, firstName: string) {
  const sql = postgres();

  db.queryOne<{ id: number; }>(sql`
    SELECT id FROM caregiver WHERE "firstName" = ${firstName}
  `);

  db.queryOne<{ id: number; firstName: string; }>(sql`
        SELECT id, "firstName"
        FROM caregiver
        WHERE
            "firstName" = ${firstName}
    `);
}

function findUserByLastName(db: Db, lastName: string) {
  const sql = postgres();
  const id = 200;

  const result = db.queryOne<{ id: number; assoc_id: number; firstName: string }>(sql`
        SELECT
            caregiver.id,
            caregiver_agency_assoc.id as assoc_id,
            "firstName"
        FROM caregiver
            JOIN caregiver_agency_assoc ON caregiver.id = caregiver_agency_assoc.caregiver
        WHERE "lastName" = ${lastName} AND caregiver.id > ${id}
    `);
}

async function main() {
  const sql = postgres("postgres://postgres:postgres@localhost:5432/medflyt_test_sim");

  const conn = createClient();

  const result = conn.queryOne<{ id: number }>(sql`
        SELECT
            caregiver.id
        FROM caregiver
            JOIN caregiver_agency_assoc ON caregiver_agency_assoc.caregiver = caregiver.id
    `);

  await sql.end();
}

main();
