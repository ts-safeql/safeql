import mysql from "mysql2/promise";

const DATABASE_NAME = "safeql_mysql2_demo";

async function main() {
  // 1. Connect to MySQL server
  console.log("Connecting to MySQL server...");
  const connection = await mysql.createConnection({
    host: "localhost",
    port: 3307,
    user: "root",
    password: "rootpass",
  });

  // 2. Drop the database if exists
  console.log("Dropping database if exists...");
  await connection.query(`DROP DATABASE IF EXISTS ${DATABASE_NAME}`);

  // 3. Create a new database
  console.log("Creating database...");
  await connection.query(`CREATE DATABASE ${DATABASE_NAME}`);

  // 4. Use the new database
  await connection.query(`USE ${DATABASE_NAME}`);

  // 5. Create tables
  console.log("Creating tables...");
  await connection.query(`
      CREATE TABLE person (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(255) NOT NULL,
        mood ENUM('sad', 'ok', 'happy') NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

  await connection.query(`
      CREATE TABLE starship (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(255) NOT NULL,
        captain_id INT,
        FOREIGN KEY (captain_id) REFERENCES person(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

  // 6. Insert sample data
  console.log("Inserting sample data...");
  await connection.query(`
      INSERT INTO person (name, mood) VALUES
      ('Alice', 'happy'),
      ('Bob', 'ok'),
      ('Charlie', 'sad')
    `);

  await connection.query(`
      INSERT INTO starship (name, captain_id) VALUES
      ('Enterprise', 1),
      ('Voyager', 2),
      ('Discovery', 3)
    `);

  console.log("✅ Done!");

  await connection.end();
}

await main();
