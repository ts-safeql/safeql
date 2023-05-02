import { execSync } from "child_process";
import postgres from "postgres";

const DATABASE_NAME = "safeql_vercel";

async function main() {
  // 1. Drop the database if exists
  console.log("Dropping database if exists...");
  execSync(`psql -c "DROP DATABASE IF EXISTS ${DATABASE_NAME} WITH (FORCE);"`);

  // 2. Create a new database
  console.log("Creating database...");
  execSync(`psql -U postgres -c "CREATE DATABASE ${DATABASE_NAME};"`);

  // 3. Connect to the database
  console.log("Connecting to database...");
  const sql = postgres(`postgres://postgres@localhost:5432/${DATABASE_NAME}`);

  // 4. Create tables
  console.log("Creating tables...");
  await sql.unsafe(`
    CREATE TABLE person (
        id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        name VARCHAR(255) NOT NULL
    );

    CREATE TABLE starship (
        id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        name VARCHAR(255) NOT NULL,
        captain_id INTEGER REFERENCES person(id)
    );
  `);

  console.log("✅ Done!");
  await sql.end();
}

main();
