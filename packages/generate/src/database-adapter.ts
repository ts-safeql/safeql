import postgres, { Sql } from "postgres";
import mysql from "mysql2/promise";

export type DatabaseDriver = "postgres" | "mysql";

/**
 * MySQL internal API types for prepared statements (undocumented).
 */
interface MySQLStatementColumn {
  name: string;
  table: string;
  schema: string;
  columnType: number;
  columnLength: number;
  flags: number;
}

interface MySQLStatementParameter {
  type: number;
  columnLength: number;
}

interface MySQLStatement {
  columns?: MySQLStatementColumn[];
  parameters?: MySQLStatementParameter[];
  close(callback: () => void): void;
}

/**
 * Metadata for Prepared Statements (common interface).
 */
export interface PreparedStatementMetadata {
  columns: ColumnMetadata[];
  parameters: ParameterMetadata[];
}

export interface ColumnMetadata {
  name: string;
  table: string;
  schema: string;
  type: number | string; // MySQL: number (columnType), PostgreSQL: string (type name)
  length: number;
  nullable: boolean;
}

export interface ParameterMetadata {
  type: number | string;
  length: number;
}

/**
 * Common interface for database connections.
 */
export interface IDatabaseConnection {
  driver: DatabaseDriver;
  prepare(query: string): Promise<PreparedStatementMetadata>;
  query<T>(sql: string): Promise<T>;
  /**
   * Execute a query and return raw results (for metadata operations).
   * MySQL: returns [rows, fields] tuple
   * PostgreSQL: returns rows only (fields are not available)
   */
  queryRaw<T>(sql: string): Promise<T>;
  end(): Promise<void>;
}

/**
 * PostgreSQL connection adapter.
 */
export class PostgresConnection implements IDatabaseConnection {
  driver: DatabaseDriver = "postgres";

  constructor(public sql: Sql) {}

  async prepare(query: string): Promise<PreparedStatementMetadata> {
    const result = await this.sql.unsafe(query, [], { prepare: true }).describe();
    return {
      columns:
        result.columns?.map((col) => ({
          name: col.name,
          table: col.table?.toString() ?? "",
          schema: "",
          type: col.type,
          length: 0,
          nullable: false,
        })) ?? [],
      parameters: [],
    };
  }

  async query<T>(sql: string): Promise<T> {
    const result = await this.sql.unsafe(sql);
    return result as T;
  }

  async queryRaw<T>(sql: string): Promise<T> {
    // PostgreSQL: just return the rows (fields are not available separately)
    const result = await this.sql.unsafe(sql);
    return result as T;
  }

  async end(): Promise<void> {
    await this.sql.end();
  }
}

/**
 * MySQL connection adapter.
 */
export class MySQLConnection implements IDatabaseConnection {
  driver: DatabaseDriver = "mysql";

  constructor(public connection: mysql.Connection) {}

  async prepare(query: string): Promise<PreparedStatementMetadata> {
    return new Promise<PreparedStatementMetadata>((resolve, reject) => {
      // @ts-expect-error - connection.connection is an internal API but required for prepare
      this.connection.connection.prepare(query, (err: Error | null, statement: MySQLStatement) => {
        if (err) {
          reject(err);
          return;
        }

        const columns: ColumnMetadata[] =
          statement.columns?.map((col) => ({
            name: col.name,
            table: col.table,
            schema: col.schema,
            type: col.columnType,
            length: col.columnLength,
            nullable: (col.flags & 1) === 0, // NOT_NULL flag check
          })) ?? [];

        const parameters: ParameterMetadata[] =
          statement.parameters?.map((param) => ({
            type: param.type,
            length: param.columnLength,
          })) ?? [];

        statement.close(() => {
          // Close statement
        });

        resolve({ columns, parameters });
      });
    });
  }

  async query<T>(sql: string): Promise<T> {
    const [rows] = await this.connection.query(sql);
    return rows as T;
  }

  async queryRaw<T>(sql: string): Promise<T> {
    // MySQL: return [rows, fields] tuple
    const result = await this.connection.query(sql);
    return result as T;
  }

  async end(): Promise<void> {
    await this.connection.end();
  }
}

/**
 * Factory function to create a database connection.
 */
export async function createDatabaseConnection(
  driver: DatabaseDriver,
  databaseUrl: string,
  options?: postgres.Options<Record<string, postgres.PostgresType>>,
): Promise<IDatabaseConnection> {
  if (driver === "postgres") {
    const sql = postgres(databaseUrl, options);
    return new PostgresConnection(sql);
  } else {
    const connection = await mysql.createConnection(databaseUrl);
    return new MySQLConnection(connection);
  }
}
