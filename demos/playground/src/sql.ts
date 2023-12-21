import postgres from "postgres";

export const sql = postgres({ username: "postgres", password: "postgres", host: "localhost" });