import { defineConfig } from "@ts-safeql/eslint-plugin";
import dotenv from "dotenv";

dotenv.config({ path: ".env.development" });

const DEFAULT_DATABASE_URL = "postgres://postgres:postgres@localhost:5432/safeql_vercel";

export default defineConfig({
  connections: {
    databaseUrl: process.env.DATABASE_URL || DEFAULT_DATABASE_URL,
    targets: [{ tag: "?(client.)sql" }],
  },
});
