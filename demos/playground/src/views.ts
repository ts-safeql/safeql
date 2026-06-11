import { sql } from "./sql";

async function run() {
  try {
    await runQueries();
  } finally {
    await sql.end();
  }
}

async function runQueries() {
  const aggregateRows = await sql<{ sum: number | null }[]>`
    SELECT sum(episode_count)::int FROM season;
  `;

  const actorViewRows = await sql<{ id: number; name: string }[]>`
    SELECT id, name FROM visible_members;
  `;

  const fallbackNameRows = await sql<{ display_name: string }[]>`
    SELECT display_name FROM actor_display_names;
  `;

  const nullableBioRows = await sql<{ bio: string | null }[]>`
    SELECT bio FROM actor_bio;
  `;

  const materializedRows = await sql<{ episode_count: number; season_id: number }[]>`
    SELECT episode_count, season_id FROM season_episode_counts;
  `;

  console.log({
    aggregateRows,
    actorViewRows,
    fallbackNameRows,
    nullableBioRows,
    materializedRows,
  });
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
