import { sql } from "./sql";

async function run() {
  const rows = await sql<{ sum: number | null }[]>`
    SELECT sum(episode_count)::int FROM season;
  `;

  console.log(rows);
  sql.end();
}

run();
