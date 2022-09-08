import path from "path";
import { TSESTree } from "@typescript-eslint/types";

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
    if (error instanceof Error) {
      return InternalError.of(error.message);
    }

    return InternalError.of("Unknown error");
  }

  toJSON() {
    return {
      _tag: this._tag,
      message: this.message,
    };
  }
}

export class DuplicateColumnsError extends Error {
  _tag = "DuplicateColumnsError" as const;
  columns: string[];
  queryText: string;

  constructor(params: { columns: string[]; queryText: string }) {
    super(`Duplicate columns: ${params.columns.join(", ")}`);
    this.columns = params.columns;
    this.queryText = params.queryText;
  }

  static of(params: { columns: string[]; queryText: string }) {
    return new DuplicateColumnsError(params);
  }

  toJSON() {
    return {
      _tag: this._tag,
      columns: this.columns,
      queryText: this.queryText,
    };
  }
}

export class PostgresError extends Error {
  _tag = "PostgresError" as const;

  queryText: string;
  message: string;
  line: string;
  position: string;

  constructor(params: { queryText: string; message: string; line: string; position: string }) {
    super(params.message);
    this.queryText = params.queryText;
    this.message = params.message;
    this.line = params.line;
    this.position = params.position;
  }

  static of(params: { queryText: string; message: string; line: string; position: string }) {
    return new PostgresError(params);
  }

  toJSON() {
    return {
      _tag: this._tag,
      queryText: this.queryText,
      message: this.message,
      line: this.line,
      position: this.position,
    };
  }
}
