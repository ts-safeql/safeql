import { generate } from "@testsql/generate";
import { json } from "fp-ts";
import postgres, { Sql } from "postgres";
import { runAsWorker } from "synckit";

const connections: Map<string, Sql<Record<string, unknown>>> = new Map();

runAsWorker(
  async (params: {
    ruleOptions: {
      databaseUrl: string;
    };
    query: string;
  }) => {
    let sql = connections.get(params.ruleOptions.databaseUrl);
    if (sql === undefined) {
      sql = postgres(params.ruleOptions.databaseUrl);
      connections.set(params.ruleOptions.databaseUrl, sql);
    }

    const value = await generate({
      query: params.query,
      sql: sql,
    });

    // await sql.end();

    return json.stringify(value);
  }
);
