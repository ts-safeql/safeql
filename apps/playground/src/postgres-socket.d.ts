import "postgres";

declare module "postgres" {
  interface Options<T extends Record<string, postgres.PostgresType>> {
    socket?: (options: Options<T>) => Promise<unknown>;
  }
}
