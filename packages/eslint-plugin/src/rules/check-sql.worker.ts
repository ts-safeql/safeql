import { generate } from "@testsql/generate";
import { json } from "fp-ts";
import postgres from "postgres";
import { runAsWorker } from "synckit";

let sql: postgres.Sql<{}> | null = null;

runAsWorker(
  async (params: {
    ruleOptions: {
      databaseUrl: string;
    };
    query: string;
  }) => {
    if (sql === null) {
      sql = postgres(params.ruleOptions.databaseUrl);
    }

    const value = await generate({
      query: params.query,
      sql: sql,
    });

    // await sql.end();

    return json.stringify(value);
  }
);
