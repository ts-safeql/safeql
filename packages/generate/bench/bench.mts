// Benchmarks warm generate() ms/query, base vs PR on the same runner. distinct =
// uncached path (the gate); repeated = result-cache path.
import fs from "node:fs";
import postgres from "postgres";
import { createGenerator } from "../src/generate";
import { runMigrations } from "../src/generate/generate.migrations";

const ADMIN = "postgres://postgres:postgres@localhost:5432/postgres";
const DB_NAME = "safeql_bench";
const DB_URL = `postgres://postgres:postgres@localhost:5432/${DB_NAME}`;

// pad to a realistic table count (the test migrations alone are too few)
const EXTRA_TABLES = 200;

const TEMPLATES: string[] = [
  `SELECT id, first_name, last_name FROM member WHERE id = {N}`,
  `SELECT * FROM all_types WHERE int_column = {N}`,
  `SELECT m.id, m.first_name, t.name FROM member m JOIN member_team mt ON mt.member_id = m.id JOIN team t ON t.id = mt.team_id WHERE m.id > {N}`,
  `SELECT m.id, ma.role FROM member m LEFT JOIN member_assignment ma ON ma.member_id = m.id WHERE m.id < {N}`,
  `SELECT count(*) AS c, max(id) AS m FROM member WHERE id <> {N}`,
  `WITH t AS (SELECT id, first_name FROM member WHERE id > {N}) SELECT t.id, t.first_name FROM t`,
  `SELECT id, first_name FROM (SELECT id, first_name FROM member WHERE id >= {N}) sub WHERE sub.id < {N}0`,
  `SELECT id, CASE WHEN id > {N} THEN 'big' ELSE 'small' END AS sz FROM member`,
  `SELECT jsonb_build_object('id', id, 'name', first_name) AS obj FROM member WHERE id = {N}`,
  `SELECT m.id, COALESCE(ma.role, 'guest') AS role FROM member m LEFT JOIN member_assignment ma ON ma.member_id = m.id WHERE m.id = {N}`,
];

const QUERIES = 2000;
const ROUNDS = 8;

function median(xs: number[]): number {
  const sorted = xs.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

async function setupDb() {
  const admin = postgres(ADMIN, { onnotice: () => {} });
  await admin.unsafe(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE ${DB_NAME}`);
  await admin.end();
  const sql = postgres(DB_URL);
  await runMigrations(sql);
  let ddl = "";
  for (let i = 0; i < EXTRA_TABLES; i++) {
    ddl += `CREATE TABLE bulk_${i} (id int primary key, a text not null, b int, c timestamptz, d jsonb);\n`;
  }
  await sql.unsafe(ddl);
  await sql.end();
}

type Decorate = (text: string, round: number, index: number) => string;

async function measure(decorate: Decorate) {
  const sql = postgres(DB_URL);
  const generator = createGenerator();
  const base = Array.from({ length: QUERIES }, (_, i) =>
    TEMPLATES[i % TEMPLATES.length].replace(/\{N\}/g, String(i + 1)),
  );
  const gen = (text: string) =>
    generator.generate({
      sql,
      query: { text, sourcemaps: [] },
      cacheKey: DB_URL,
      fieldTransform: undefined,
    });

  for (let i = 0; i < 300; i++) await gen(decorate(base[i % base.length], -1, i));

  const perRound: number[] = [];
  for (let r = 0; r < ROUNDS; r++) {
    const s = performance.now();
    for (let i = 0; i < base.length; i++) await gen(decorate(base[i], r, i));
    perRound.push(performance.now() - s);
  }
  await sql.end();
  return median(perRound) / QUERIES;
}

async function main() {
  await setupDb();

  const distinct = await measure((text, round, index) => `${text} /*d${round}-${index}*/`);
  const repeated = await measure((text) => text);

  const metrics = {
    schemaTables: EXTRA_TABLES,
    queries: QUERIES,
    rounds: ROUNDS,
    msPerQueryDistinct: Number(distinct.toFixed(4)),
    msPerQueryRepeated: Number(repeated.toFixed(4)),
    nodeVersion: process.version,
  };

  const out = JSON.stringify(metrics, null, 2);
  const dest = process.argv[2];
  if (dest) fs.writeFileSync(dest, out);
  console.log(out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
