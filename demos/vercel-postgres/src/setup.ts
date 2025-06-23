import { execSync } from "child_process";
import dotenv from "dotenv";
import pg from "pg";

const DATABASE_NAME = "safeql_vercel";

/**
 * Sets up the PostgreSQL database by dropping and recreating it, then creating required tables.
 *
 * Drops the existing "safeql_vercel" database if it exists, creates a new one, and establishes the "person" and "starship" tables with appropriate schema.
 */
async function main() {
  // 1. Drop the database if exists
  console.log("Dropping database if exists...");
  execSync(`psql -c "DROP DATABASE IF EXISTS ${DATABASE_NAME} WITH (FORCE);"`);

  // 2. Create a new database
  console.log("Creating database...");
  execSync(`psql -U postgres -c "CREATE DATABASE ${DATABASE_NAME};"`);

  // 3. Connect to the database
  console.log("Connecting to database...");
  dotenv.config({ path: ".env.development.local" });
  const client = new pg.Client({ connectionString: process.env.POSTGRES_URL });
  await client.connect();

  // 4. Create tables
  console.log("Creating tables...");
  await client.query(`
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
  await client.end();
}

main();
