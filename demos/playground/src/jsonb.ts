import postgres from "postgres";

const sql = postgres({ username: "postgres", password: "postgres", host: "localhost" });

async function run() {
  const rows = await sql<{ id: number; episode_list: { Title: string; Number: number }[] }[]>`
    SELECT 
      season.id,
      jsonb_agg(
        jsonb_build_object(
          'Title', episode.title,
          'Number', episode.episode_number
        )
      ) AS episode_list
    FROM season
      JOIN episode ON season.id = episode.season_id
    GROUP BY season.id;
  `;

  for (const row of rows) {
    for (const episode of row.episode_list) {
      console.log(episode["Title"], episode["Number"]);
    }
  }
}

run();
