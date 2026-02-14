export type {
  GenerateError,
  GenerateParams,
  GenerateResult,
  ResolvedTargetEntry,
  ResolvedTarget,
} from "./src/generate";
export { createGenerator } from "./src/generate";

// Database adapter exports
export type {
  DatabaseDriver,
  PreparedStatementMetadata,
  ColumnMetadata,
  ParameterMetadata,
  IDatabaseConnection,
} from "./src/database-adapter";
export { PostgresConnection, MySQLConnection, createDatabaseConnection } from "./src/database-adapter";
