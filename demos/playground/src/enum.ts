import { sql } from "./sql";

enum Mood {
  Happy = "happy",
  Sad = "sad",
}

async function run() {
  await sql<{ name: string }[]>`SELECT name from genre where mood = ${Mood.Happy}`;
}

run();
