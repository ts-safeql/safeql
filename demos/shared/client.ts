import postgres from "postgres";

export function createClient() {
  async function queryOne<T>(query: postgres.PendingQuery<postgres.Row[]>): Promise<T> {
    const results = await query;

    if (results.length !== 1) {
      throw new Error(`Expected one result, got ${results.length}`);
    }

    return results[0] as T;
  }

  return { queryOne };
}

export type Unknown<T> = T | undefined;
export type Nullable<T> = T | null;
export type Db = ReturnType<typeof createClient>;
