import { PostgresError } from "./postgres-errors";

function postgres(): never {
  throw new Error("postgres() is not available in the browser playground");
}

postgres.PostgresError = PostgresError;

export { PostgresError };
export default postgres;
