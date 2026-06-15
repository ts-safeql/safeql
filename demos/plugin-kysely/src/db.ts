import { Generated, Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

// The Kysely schema for the demo, matching `migrations/0001_init.ts`.
export interface Database {
  person: {
    id: Generated<number>;
    first_name: string;
    email: string;
    bio: string | null;
  };
  pet: {
    id: Generated<number>;
    owner_id: number;
    name: string;
    species: string;
  };
}

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool: new Pool() }),
});
