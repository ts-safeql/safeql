import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const __dirname = new URL(".", import.meta.url).pathname;

const FAKE_SRC_PATH = path.join(__dirname, "..", "_fake_src");
const MAX_TIME = /* 50 seconds */ 50 * 1000;
const TOTAL_FILES = 3000;

async function before() {
  const value = await fs.promises.readFile("./src/original.ts", "utf8");

  await fs.promises.mkdir(FAKE_SRC_PATH);

  for (let i = 1; i <= TOTAL_FILES; i++) {
    await fs.promises.writeFile(path.join(FAKE_SRC_PATH, `temp-file-${i}.ts`), value);
  }
}

async function after() {
  await fs.promises.rm(FAKE_SRC_PATH, { recursive: true });
}

async function test() {
  await before();

  try {
    const start = Date.now();
    execSync(`pnpm eslint ${FAKE_SRC_PATH}`, { stdio: "inherit" });
    const end = Date.now();

    const perFile = ((end - start) / TOTAL_FILES).toFixed(2);

    console.log(`
      Total files: ${TOTAL_FILES}
      Total time: ${(end - start).toFixed(2)}ms
      Per file: ${perFile} ms
    `);

    if (end - start > MAX_TIME) {
      throw new Error(`Test took too long: ${end - start}ms. Max time: ${MAX_TIME}ms`);
    }
  } finally {
    await after();
  }
}

test();
