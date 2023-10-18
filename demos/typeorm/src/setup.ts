import { execSync } from "child_process";
import { AppDataSource } from "./data-source";
import { Person } from "./entity/Person";
import { Starship } from "./entity/Starship";

const DATABASE_NAME = "safeql_typeorm";

async function main() {
  // 1. Drop the database if exists
  console.log("Dropping database if exists...");
  execSync(`psql -c "DROP DATABASE IF EXISTS ${DATABASE_NAME} WITH (FORCE);"`);

  // 2. Create a new database
  console.log("Creating database...");
  execSync(`psql -U postgres -c "CREATE DATABASE ${DATABASE_NAME};"`);

  // 3. Initialize TypeORM
  console.log("Initializing TypeORM...");
  await AppDataSource.initialize();

  // 4. Populate tables
  console.log("Populating tables...");
  const personRepository = AppDataSource.getRepository(Person);
  const person = new Person();
  person.name = "John Doe";
  await personRepository.save(person);
  const person2 = new Person();
  person2.name = "Jane Doe";
  await personRepository.save(person2);
  const starshipRepository = AppDataSource.getRepository(Starship);
  const starship = new Starship();
  starship.name = "Millennium Falcon";
  starship.captain = person;
  await starshipRepository.save(starship);

  console.log("✅ Done!");
  await AppDataSource.destroy();
}

main();
