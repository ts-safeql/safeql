import path from "path";
import { TSESTree } from "@typescript-eslint/utils";
import postgres from "postgres";

export class DatabaseInitializationError extends Error {
  _tag = "DatabaseInitializationError" as const;

  constructor(message: string) {
    super(`Database initialization failed (${message})`);
    this.message = message;
  }

  static of(pgError: string) {
    return new DatabaseInitializationError(pgError);
  }

  static to(error: unknown) {
    if (error instanceof Error) {
      return DatabaseInitializationError.of(error.message);
    }

    return DatabaseInitializationError.of("Unknown error");
  }

  toJSON() {
    return {
      _tag: this._tag,
      message: this.message,
    };
  }
}

export class InvalidMigrationsPathError extends Error {
  _tag = "InvalidMigrationsPathError" as const;

  migrationsPath: string;

  constructor(migrationsPath: string, message: string) {
    super(`Failed to read migrations directory "${migrationsPath}" (${message})`);
    this.migrationsPath = migrationsPath;
    this.message = message;
  }

  static of(filePath: string, pgError: string) {
    return new InvalidMigrationsPathError(filePath, pgError);
  }

  static fromErrorC(migrationsPath: string) {
    return (error: Error) => InvalidMigrationsPathError.of(migrationsPath, error.message);
  }

  toJSON() {
    return {
      _tag: this._tag,
      migrationsPath: this.migrationsPath,
      message: this.message,
    };
  }
}

export class InvalidConfigError extends Error {
  _tag = "InvalidConfigError" as const;

  constructor(message: string) {
    super(`Invalid configuration (${message})`);
    this.message = message;
  }

  static of(message: string) {
    return new InvalidConfigError(message);
  }

  toJSON() {
    return {
      _tag: this._tag,
      message: this.message,
    };
  }
}

export class InvalidMigrationError extends Error {
  _tag = "InvalidMigrationError" as const;

  filePath: string;

  constructor(filePath: string, message: string) {
    super(`Failed to run migration "${path.basename(filePath)}" (${message})`);
    this.filePath = filePath;
    this.message = message;
  }

  static of(filePath: string, pgError: string) {
    return new InvalidMigrationError(filePath, pgError);
  }

  static fromErrorC(migrationsPath: string) {
    return (error: Error) => InvalidMigrationError.of(migrationsPath, error.message);
  }

  toJSON() {
    return {
      _tag: this._tag,
      filePath: this.filePath,
      message: this.message,
    };
  }
}

export class InvalidQueryError extends Error {
  _tag = "InvalidQueryError" as const;

  node: TSESTree.Expression;

  constructor(error: string, node: TSESTree.Expression) {
    super(error);
    this.node = node;
  }

  static of(error: string, node: TSESTree.Expression) {
    return new InvalidQueryError(error, node);
  }

  toJSON() {
    return {
      _tag: this._tag,
      message: this.message,
      node: this.node,
    };
  }
}

export class InternalError extends Error {
  _tag = "InternalError" as const;

  constructor(error: string) {
    super(`Internal error: ${error}`);
  }

  static of(error: string) {
    return new InternalError(error);
  }

  static to(error: unknown) {
    if (error instanceof AggregateError) {
      const e = InternalError.of(error.errors.map((e) => e.message).join(", "));
      e.stack = error.stack;
      return e;
    }

    if (error instanceof Error) {
      const e = InternalError.of(error.message);
      e.stack = error.stack;

      return e;
    }

    return InternalError.of(`Unknown (${error})`);
  }

  toJSON() {
    return {
      _tag: this._tag,
      stack: this.stack,
      message: this.message,
    };
  }
}

export class DuplicateColumnsError extends Error {
  _tag = "DuplicateColumnsError" as const;
  columns: string[];
  queryText: string;
  position: number;
  sourcemaps: QuerySourceMapEntry[];

  constructor(params: {
    columns: string[];
    queryText: string;
    position: number;
    sourcemaps: QuerySourceMapEntry[];
  }) {
    super(`Duplicate columns: ${params.columns.join(", ")}`);
    this.columns = params.columns;
    this.queryText = params.queryText;
    this.position = params.position;
    this.sourcemaps = params.sourcemaps;
  }

  static of(params: {
    columns: string[];
    queryText: string;
    position: number;
    sourcemaps: QuerySourceMapEntry[];
  }) {
    return new DuplicateColumnsError(params);
  }

  toJSON() {
    return {
      _tag: this._tag,
      message: this.message,
      columns: this.columns,
      queryText: this.queryText,
      position: this.position,
      sourcemaps: this.sourcemaps,
    };
  }
}

export interface QuerySourceMapEntry {
  original: { start: number; end: number; text: string };
  generated: { start: number; end: number; text: string };
  offset: number;
}

export class PostgresError extends Error {
  _tag = "PostgresError" as const;

  queryText: string;
  message: string;
  line: string;
  position: number;
  sourcemaps: QuerySourceMapEntry[];

  constructor(params: {
    queryText: string;
    message: string;
    line: string;
    position: number | string;
    sourcemaps: QuerySourceMapEntry[];
  }) {
    super(params.message);
    this.name = "PostgresError";
    this.queryText = params.queryText;
    this.message = params.message;
    this.line = params.line;
    this.position = Number(params.position);
    this.sourcemaps = params.sourcemaps;
  }

  static of(params: {
    queryText: string;
    message: string;
    line: string;
    position: number | string;
    sourcemaps: QuerySourceMapEntry[];
  }) {
    return new PostgresError(params);
  }

  static to(query: string, error: unknown, sourcemaps: QuerySourceMapEntry[]) {
    if (isPostgresError(error)) {
      return PostgresError.of({
        queryText: query,
        message: error.message,
        line: error.line,
        position: error.position,
        sourcemaps,
      });
    }

    return PostgresError.of({
      queryText: query,
      message: `${error}`,
      line: "1",
      position: isPgParserError(error) ? error.cursorPosition : 0,
      sourcemaps: sourcemaps,
    });
  }

  toJSON() {
    return {
      _tag: this._tag,
      queryText: this.queryText,
      message: this.message,
      line: this.line,
      position: this.position,
      sourcemaps: this.sourcemaps,
    };
  }
}

export function isPostgresError(e: unknown): e is postgres.PostgresError {
  if (e instanceof postgres.PostgresError) {
    return true;
  }

  if (e instanceof Error && e.name === "PostgresError") {
    return true;
  }

  return false;
}

function isPgParserError(error: unknown): error is Error & { cursorPosition: number } {
  return error instanceof Error && "cursorPosition" in error;
}
