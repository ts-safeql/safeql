import { defineConfig } from "@ts-safeql/eslint-plugin";
import dotenv from "dotenv";

dotenv.config({ path: ".env.development.local" });

const FALLBACK_POSTGRES_URL = "postgres://postgres:postgres@localhost:5432/safeql_vercel";

export default defineConfig({
  connections: {
    databaseUrl: process.env.POSTGRES_URL || FALLBACK_POSTGRES_URL,
    targets: [{ tag: "?(client.)sql" }],
  },
});
