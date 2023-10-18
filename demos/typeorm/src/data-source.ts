import { DataSource } from "typeorm";

export const AppDataSource = new DataSource({
  type: "postgres",
  host: "localhost",
  port: 5432,
  database: "safeql_typeorm",
  synchronize: true,
  entities: [__dirname + "/entity/*"],
});
