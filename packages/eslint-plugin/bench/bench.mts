// Benchmarks the check-sql rule end to end via the ESLint API, base vs PR on the
// same runner. msRuleOverhead is the lint pass with the rule on minus off.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import tsParser from "@typescript-eslint/parser";
import postgres from "postgres";
import rules from "../src/rules";
import {
  CHECK_SQL_POSTGRES_URL,
  runCheckSqlMigrations,
} from "../src/rules/check-sql/check-sql.migrations";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(here, ".fixture");
const DB_NAME = "safeql_eslint_bench";
const DB_URL = `postgres://postgres:postgres@localhost:5432/${DB_NAME}`;

const FILES = 50;
const QUERIES_PER_FILE = 15;
const ROUNDS = 6;
const EXTRA_TABLES = 150;

const TEMPLATES = [
  (n: number) =>
    `sql<{ id: number; first_name: string }[]>\`SELECT id, first_name FROM member WHERE id = ${n}\``,
  (n: number) =>
    `sql<{ id: number; role: string }[]>\`SELECT id, role FROM member WHERE id > ${n}\``,
  (n: number) => `sql<{ name: string }[]>\`SELECT name FROM team WHERE id = ${n}\``,
  (n: number) =>
    `sql<{ c: number }[]>\`SELECT count(*) AS c FROM member_team WHERE member_id <> ${n}\``,
  (n: number) =>
    `sql<{ id: number; name: string }[]>\`SELECT m.id, t.name FROM member m JOIN member_team mt ON mt.member_id = m.id JOIN team t ON t.id = mt.team_id WHERE m.id > ${n}\``,
];

function median(xs: number[]): number {
  const sorted = xs.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

async function setupDb() {
  const admin = postgres(CHECK_SQL_POSTGRES_URL, { onnotice: () => {} });
  await admin.unsafe(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE ${DB_NAME}`);
  await admin.end();
  const sql = postgres(DB_URL);
  await runCheckSqlMigrations(sql);
  let ddl = "";
  for (let i = 0; i < EXTRA_TABLES; i++) {
    ddl += `CREATE TABLE bulk_${i} (id int primary key, a text not null, b int);\n`;
  }
  await sql.unsafe(ddl);
  await sql.end();
}

function writeFixture() {
  fs.rmSync(FIXTURE, { recursive: true, force: true });
  fs.mkdirSync(FIXTURE, { recursive: true });
  fs.writeFileSync(
    path.join(FIXTURE, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          strict: true,
          skipLibCheck: true,
          module: "esnext",
          moduleResolution: "bundler",
          noEmit: true,
        },
        include: ["**/*.ts"],
      },
      null,
      2,
    ),
  );
  const files: string[] = [];
  for (let f = 0; f < FILES; f++) {
    const body = Array.from({ length: QUERIES_PER_FILE }, (_, q) => {
      const n = f * 1000 + q + 1;
      return "  " + TEMPLATES[(f + q) % TEMPLATES.length](n) + ";";
    }).join("\n");
    const file = path.join(FIXTURE, `temp-${f}.ts`);
    fs.writeFileSync(
      file,
      `import postgres from "postgres";\nexport function check${f}() {\n  const sql = postgres();\n${body}\n}\n`,
    );
    files.push(file);
  }
  return files;
}

function makeEslint(ruleOn: boolean) {
  const connection = { databaseUrl: DB_URL, targets: [{ tag: "sql" }], keepAlive: true };
  return new ESLint({
    cwd: FIXTURE,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.ts"],
        languageOptions: {
          parser: tsParser,
          parserOptions: { projectService: true, tsconfigRootDir: FIXTURE },
        },
        plugins: { "@ts-safeql": { rules: { "check-sql": rules["check-sql"] } } },
        rules: { "@ts-safeql/check-sql": ruleOn ? ["error", { connections: connection }] : "off" },
      },
    ],
  });
}

async function lint(ruleOn: boolean, files: string[]): Promise<number> {
  const eslint = makeEslint(ruleOn);
  const s = performance.now();
  await eslint.lintFiles(files);
  return performance.now() - s;
}

async function main() {
  await setupDb();
  const files = writeFixture();

  await lint(true, files); // warm-up

  // interleaved on/off so the delta cancels system noise
  const onTimes: number[] = [];
  const overheads: number[] = [];
  for (let r = 0; r < ROUNDS; r++) {
    const on = await lint(true, files);
    const off = await lint(false, files);
    onTimes.push(on);
    overheads.push(Math.max(0, on - off));
  }
  fs.rmSync(FIXTURE, { recursive: true, force: true });

  const msTotal = median(onTimes);
  const msRuleOverhead = median(overheads);
  const metrics = {
    files: FILES,
    queriesPerFile: QUERIES_PER_FILE,
    rounds: ROUNDS,
    msTotal: Number(msTotal.toFixed(0)),
    msRuleOverhead: Number(msRuleOverhead.toFixed(0)),
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
