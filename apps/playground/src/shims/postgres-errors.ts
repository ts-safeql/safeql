/** Minimal postgres.js PostgresError compatible with @ts-safeql/shared isPostgresError */
export class PostgresError extends Error {
  code?: string;
  position?: string | number;
  line?: string | number;
  severity?: string;
  detail?: string;
  hint?: string;
  schema?: string;
  table?: string;
  column?: string;

  constructor(fields: Record<string, unknown> & { message: string }) {
    super(fields.message);
    this.name = "PostgresError";
    Object.assign(this, fields);
  }
}
