import { sql } from "./sql";

async function run() {
  type Episode = {
    "Episode Title": string;
    "Episode Number": number;
  };

  type Row = {
    "Episode List": Episode[];
  };

  const rows = await sql<Row[]>`
    SELECT 
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'Episode Title', episode.title,
            'Episode Number', episode.episode_number
          )
        ),
        '[]'::jsonb
      ) AS "Episode List"
    FROM season
      JOIN episode ON season.id = episode.season_id
    GROUP BY season.id;
  `;

  for (const row of rows) {
    for (const episode of row["Episode List"]) {
      console.log(episode["Episode Title"], episode["Episode Number"]);
    }
  }
}

run();
