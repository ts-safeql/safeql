import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createConnectionManager } from "./index";
import { ConnectionManagerTestDriver } from "./test-driver";

describe("connection-manager plugins", () => {
  const driver = new ConnectionManagerTestDriver();

  beforeAll(() => driver.setup());
  afterAll(() => driver.teardown());

  describe("sunny", () => {
    it("loads a plugin and connects to the database", async () => {
      // ARRANGE
      const plugin = driver.createPlugin({
        name: "test-connect",
        imports: ['import postgres from "postgres"'],
        createConnection: {
          cacheKey: '"test://" + config.databaseUrl',
          handler: "return postgres(config.databaseUrl)",
        },
      });

      // ACT
      const { payload } = await driver.connect({
        descriptors: [{ package: plugin, config: { databaseUrl: driver.databaseUrl } }],
      });
      const rows = await payload.sql`SELECT 1 as x`;

      // ASSERT
      expect(payload.isFirst).toBe(true);
      expect(rows[0].x).toBe(1);
    });

    it("returns cached connection on subsequent calls", async () => {
      // ARRANGE
      const plugin = driver.createPlugin({
        name: "test-cached",
        imports: ['import postgres from "postgres"'],
        createConnection: {
          cacheKey: '"cached://" + config.databaseUrl',
          handler: "return postgres(config.databaseUrl)",
        },
      });
      const descriptors = [{ package: plugin, config: { databaseUrl: driver.databaseUrl } }];

      // ACT
      const { payload: first, reconnect } = await driver.connect({ descriptors });
      const second = await reconnect();

      // ASSERT
      expect(first.isFirst).toBe(true);
      expect(second.isFirst).toBe(false);
      expect(second.sql).toBe(first.sql);
    });

    it("last plugin with createConnection wins", async () => {
      // ARRANGE
      const first = driver.createPlugin({
        name: "test-first",
        imports: ['import postgres from "postgres"'],
        createConnection: {
          cacheKey: '"first://" + config.databaseUrl',
          handler: "return postgres(config.databaseUrl)",
        },
      });
      const last = driver.createPlugin({
        name: "test-last",
        createConnection: {
          cacheKey: '"last"',
          handler: 'throw new Error("last plugin wins")',
        },
      });

      // ACT & ASSERT
      await expect(
        driver.connect({
          descriptors: [
            { package: first, config: { databaseUrl: driver.databaseUrl } },
            { package: last, config: {} },
          ],
        }),
      ).rejects.toThrow("last plugin wins");
    });

    it("resolves relative plugin paths per project directory", async () => {
      const manager = createConnectionManager();
      const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "safeql-local-plugin-"));

      const createProject = (name: string) => {
        const dir = path.join(tmpRoot, name);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "package.json"), "{}");
        fs.writeFileSync(
          path.join(dir, "plugin.ts"),
          String.raw`
import postgres from "postgres";
import { definePlugin } from "@ts-safeql/plugin-utils";

export default definePlugin({
  name: "${name}",
  package: "./plugin.ts",
  setup(config) {
    return {
      createConnection: {
        cacheKey: "${name}://" + config.databaseUrl,
        async handler() {
          return postgres(config.databaseUrl);
        },
      },
    };
  },
});
`,
        );
        return dir;
      };

      const firstProject = createProject("first-local");
      const secondProject = createProject("second-local");
      const descriptors = [{ package: "./plugin.ts", config: { databaseUrl: driver.databaseUrl } }];

      let first;
      let second;

      try {
        first = await manager.getOrCreateFromPlugins(descriptors, firstProject);
        second = await manager.getOrCreateFromPlugins(descriptors, secondProject);

        expect(first.pluginName).toBe("safeql-plugin-first-local");
        expect(first.databaseUrl).toBe(`first-local://${driver.databaseUrl}`);
        expect(second.pluginName).toBe("safeql-plugin-second-local");
        expect(second.databaseUrl).toBe(`second-local://${driver.databaseUrl}`);
      } finally {
        await first?.sql.end().catch(() => {});
        if (second?.sql && second.sql !== first?.sql) {
          await second.sql.end().catch(() => {});
        }
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      }
    });
  });

  describe("rainy", () => {
    it("throws when plugin package is not found", async () => {
      // ARRANGE
      const descriptors = [{ package: "@ts-safeql/nonexistent-plugin", config: {} }];

      // ACT & ASSERT
      await expect(driver.connect({ descriptors, projectDir: os.tmpdir() })).rejects.toThrow(
        "could not be loaded",
      );
    });

    it("throws when plugin has no default export", async () => {
      // ARRANGE
      const plugin = driver.createRawModule("no-default", 'export const name = "not-a-plugin";');

      // ACT & ASSERT
      await expect(
        driver.connect({ descriptors: [{ package: plugin, config: {} }] }),
      ).rejects.toThrow("must default-export a definePlugin() result");
    });

    it("throws when plugin factory returns invalid shape", async () => {
      // ARRANGE
      const plugin = driver.createRawModule(
        "no-name",
        'export default function() { return { cacheKey: "test" }; }',
      );

      // ACT & ASSERT
      await expect(
        driver.connect({ descriptors: [{ package: plugin, config: {} }] }),
      ).rejects.toThrow("must default-export a definePlugin() result");
    });

    it("throws when createConnection handler fails", async () => {
      // ARRANGE
      const plugin = driver.createPlugin({
        name: "test-cred-error",
        createConnection: {
          cacheKey: '"error"',
          handler: 'throw new Error("invalid credentials")',
        },
      });

      // ACT & ASSERT
      await expect(
        driver.connect({ descriptors: [{ package: plugin, config: {} }] }),
      ).rejects.toThrow("invalid credentials");
    });

    it("throws when no plugin provides createConnection", async () => {
      // ARRANGE
      const plugin = driver.createPlugin({ name: "test-no-conn" });

      // ACT & ASSERT
      await expect(
        driver.connect({ descriptors: [{ package: plugin, config: {} }] }),
      ).rejects.toThrow("provide a createConnection hook");
    });

    it("throws when descriptors array is empty and projectDir is not provided", async () => {
      // ACT & ASSERT
      await expect(driver.connect({ descriptors: [] })).rejects.toThrow(
        "at least one plugin descriptor",
      );
    });
  });
});
