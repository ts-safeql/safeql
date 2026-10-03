import { sql } from "kysely";
import { db } from "./db";

/**
 * Full raw `sql` queries with Kysely's `sql` expressions interpolated in. SafeQL
 * validates the whole compiled query against the migrated schema.
 */

export function rawSelect() {
  return sql<{ id: number; first_name: string }>`SELECT id, first_name FROM person`.execute(db);
}

export function rawNullable() {
  return sql<{ bio: string | null }>`SELECT bio FROM person`.execute(db);
}

// sql.ref → quoted identifier
export function rawRef() {
  const column = "first_name";
  return sql<{ first_name: string }>`SELECT ${sql.ref(column)} FROM person`.execute(db);
}

// sql.table → quoted table
export function rawTable() {
  return sql<{ email: string }>`SELECT email FROM ${sql.table("person")}`.execute(db);
}

// sql.lit → inlined literal; plain interpolation → bound parameter
export function rawLitAndParam(id: number) {
  return sql<{ email: string }>`
    SELECT email FROM person WHERE id = ${id} AND first_name <> ${sql.lit("")}
  `.execute(db);
}

// sql.join → expanded positional params
export function rawIn(ids: number[]) {
  if (ids.length === 0) {
    return sql<{ id: number }>`SELECT id FROM person WHERE false`.execute(db);
  }
  return sql<{ id: number }>`SELECT id FROM person WHERE id IN (${sql.join(ids)})`.execute(db);
}

export function rawJoin() {
  return sql<{ first_name: string; name: string }>`
    SELECT person.first_name, pet.name
    FROM person
    JOIN pet ON pet.owner_id = person.id
  `.execute(db);
}

export function rawInsert(firstName: string, email: string) {
  return sql<{ id: number }>`
    INSERT INTO person (first_name, email) VALUES (${firstName}, ${email}) RETURNING id
  `.execute(db);
}

// eslint-disable-next-line @ts-safeql/check-sql -- column "nope" does not exist
export const rawBadColumn = sql<{ x: number }>`SELECT nope FROM person`.execute(db);

// eslint-disable-next-line @ts-safeql/check-sql -- id is a number, not a string
export const rawWrongType = sql<{ id: string }>`SELECT id FROM person`.execute(db);
