import postgres, { RowList } from "postgres";

export function createClient() {
  async function query<T>(query: postgres.PendingQuery<postgres.Row[]>) {
    const results = await query;

    return results as RowList<T[]>;
  }

  async function queryOne<T>(query: postgres.PendingQuery<postgres.Row[]>): Promise<T> {
    const results = await query;

    if (results.length !== 1) {
      throw new Error(`Expected one result, got ${results.length}`);
    }

    return results[0] as T;
  }

  return { query, queryOne };
}

export type Db = ReturnType<typeof createClient>;
