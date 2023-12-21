import { sql } from "./sql";

async function run() {
  const rows = await sql<{ episode_list: { 'Episode Title': string; 'Episode Number': number }[] }[]>`
    SELECT 
      jsonb_agg(
        jsonb_build_object(
          'Episode Title', episode.title,
          'Episode Number', episode.episode_number
        )
      ) AS episode_list
    FROM season
      JOIN episode ON season.id = episode.season_id
    GROUP BY season.id;
  `;

  for (const row of rows) {
    for (const episode of row.episode_list) {
      console.log(episode["Episode Title"], episode["Episode Number"]);
    }
  }
}

run();
