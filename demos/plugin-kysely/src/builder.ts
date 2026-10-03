import { sql, type SqlBool } from "kysely";
import { db } from "./db";

/**
 * Fluent builder chains with partial raw `sql` expressions embedded in them.
 * SafeQL compiles the whole chain (through the fragments) and validates the
 * embedded raw sql against the schema. Pure builder queries with no raw sql are
 * left to Kysely's own types.
 */

// raw expression in a `.select(...)`
export function builderSelectExpr() {
  return db
    .selectFrom("person")
    .select(sql<string>`first_name || ' <' || email || '>'`.as("label"))
    .execute();
}

// raw aggregate in a `.select(...)`
export function builderAggregate() {
  return db
    .selectFrom("person")
    .select(sql<string>`count(*)`.as("total"))
    .execute();
}

// raw condition in a `.where(...)`, with a bound-parameter interpolation
export function builderWhereExpr(minId: number) {
  return db
    .selectFrom("person")
    .select("id")
    .where(sql<SqlBool>`id > ${minId} and bio is not null`)
    .execute();
}

// These embed invalid raw sql; the disables keep the demo green while proving
// SafeQL flags them (verified via --report-unused-disable-directives).
/* eslint-disable @ts-safeql/check-sql */

// column "nonexistent" does not exist
export const builderBadColumn = db
  .selectFrom("person")
  .select(sql<string>`upper(nonexistent)`.as("shout"))
  .execute();

// function "bogus_fn" does not exist
export const builderBadFn = db
  .selectFrom("person")
  .select("id")
  .where(sql<SqlBool>`bogus_fn(id)`)
  .execute();

/* eslint-enable @ts-safeql/check-sql */
