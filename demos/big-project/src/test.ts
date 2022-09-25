import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const FAKE_SRC_PATH = path.join(__dirname, "..", "_fake_src");
const MAX_TIME = /* 40 seconds */ 40 * 1000;
const TOTAL_FILES = 5000;

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

    console.log(`
        Total time: ${end - start}ms
        Average time per file: ${(end - start) / TOTAL_FILES}ms
        `);

    if (end - start > MAX_TIME) {
      throw new Error(`Test took too long: ${end - start}ms. Max time: ${MAX_TIME}ms`);
    }
  } finally {
    await after();
  }
}

test();
