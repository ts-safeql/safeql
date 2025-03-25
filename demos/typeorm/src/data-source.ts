import { DataSource } from "typeorm";

const __dirname = new URL(".", import.meta.url).pathname;

export const AppDataSource = new DataSource({
  type: "postgres",
  host: "localhost",
  port: 5432,
  database: "safeql_typeorm",
  synchronize: true,
  entities: [__dirname + "/entity/*"],
});
