import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, describe, test } from "vitest";
import { PluginManager } from "./resolve";

const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "safeql-plugin-resolve-"));

afterAll(() => fs.rmSync(projectDir, { recursive: true, force: true }));

function writePlugin(fileName: string, moduleExports: string): string {
  fs.writeFileSync(path.join(projectDir, fileName), `module.exports = ${moduleExports};`);
  return `./${fileName}`;
}

function pluginFactory(name: string, hooks = "") {
  return `(config) => ({ name: ${JSON.stringify(name)}, ${hooks} })`;
}

describe("PluginManager plugin factory lookup", () => {
  test.each([
    {
      shape: "definePlugin default export",
      exports: (f: string) => `{ default: { factory: ${f} } }`,
    },
    {
      shape: "CJS double-wrapped default export",
      exports: (f: string) => `{ default: { default: { factory: ${f} } } }`,
    },
    { shape: "factory on the module itself", exports: (f: string) => `{ factory: ${f} }` },
  ])("finds the factory on a $shape", ({ shape, exports }) => {
    const name = shape.replace(/\W+/g, "-");
    const pluginPath = writePlugin(`${name}.cjs`, exports(pluginFactory(name)));

    const [plugin] = new PluginManager().resolvePluginsSync([{ package: pluginPath }], projectDir);

    assert.equal(plugin?.name, name);
  });
});

describe("PluginManager hook selection", () => {
  const first = writePlugin(
    "first.cjs",
    `{ factory: ${pluginFactory(
      "first",
      `migrate: async () => {}, createConnection: { cacheKey: "first", handler: async () => {} }`,
    )} }`,
  );
  const second = writePlugin(
    "second.cjs",
    `{ factory: ${pluginFactory(
      "second",
      `migrate: async () => {}, createConnection: { cacheKey: "second", handler: async () => {} }`,
    )} }`,
  );
  const withoutHooks = writePlugin("without-hooks.cjs", `{ factory: ${pluginFactory("none")} }`);
  const descriptors = [{ package: first }, { package: second }, { package: withoutHooks }];

  test("the last plugin declaring migrate wins", () => {
    const migrate = new PluginManager().resolveMigrate(descriptors, projectDir);

    assert.equal(migrate?.pluginName, "second");
  });

  test("the last plugin declaring createConnection wins", () => {
    const connection = new PluginManager().resolveConnection(descriptors, projectDir);

    assert.equal(connection?.pluginName, "second");
  });
});
