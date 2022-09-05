import { execSync } from "node:child_process";
import postgres from "postgres";

async function main() {
  // 1. Drop the database if exists
  console.log("Dropping database if exists...");
  execSync(`psql -c "DROP DATABASE IF EXISTS safeql_basic;"`);

  // 2. Create a new database
  console.log("Creating database...");
  execSync(`psql -U postgres -c "CREATE DATABASE safeql_basic;"`);

  // 3. Connect to the database
  console.log("Connecting to database...");
  const sql = postgres("postgres://postgres@localhost:5432/safeql_basic");

  // 4. Create tables
  console.log("Creating tables...");
  await sql.unsafe(`
    CREATE TABLE person (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL
    );

    CREATE TABLE starship (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        captain_id INTEGER REFERENCES person(id)
    );
  `);

  console.log("✅ Done!");
  await sql.end();
}

main();
