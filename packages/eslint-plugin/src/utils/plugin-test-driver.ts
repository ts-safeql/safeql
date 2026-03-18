import fs from "fs";
import os from "os";
import path from "path";
import { setupTestDatabase, generateTestDatabaseName } from "@ts-safeql/test-utils";
import { createConnectionManager } from "./connection-manager";
import type { ConnectionPayload } from "../rules/check-sql.utils";

const POSTGRES_URL = "postgres://postgres:postgres@localhost:5432/postgres";

type PluginDescriptor = { package: string; config: Record<string, unknown> };

export interface PluginSource {
  name: string;
  imports?: string[];
  createConnection?: {
    cacheKey: string;
    handler: string;
  };
}

/**
 * Framework-agnostic test driver for the SafeQL plugin system.
 * Call `setup()` / `teardown()` from your runner's lifecycle hooks.
 */
export class PluginTestDriver {
  databaseUrl = "";
  private tempDirs: string[] = [];
  private connections: Array<{ end(): Promise<void> }> = [];
  private dropDb: (() => Promise<unknown>) | undefined;

  async setup() {
    const result = await setupTestDatabase({
      databaseName: generateTestDatabaseName(),
      postgresUrl: POSTGRES_URL,
    });
    this.databaseUrl = result.databaseUrl;
    this.dropDb = result.drop;
    await result.sql.end();
  }

  async teardown() {
    for (const conn of this.connections) {
      await conn.end().catch(() => {});
    }
    await this.dropDb?.();
    for (const dir of this.tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  createPlugin(source: PluginSource): string {
    const imports = [
      'import { definePlugin } from "@ts-safeql/plugin-utils";',
      ...(source.imports ?? []),
    ].join("\n");

    const connectionHook = source.createConnection
      ? `
      createConnection: {
        cacheKey: ${source.createConnection.cacheKey},
        async handler() { ${source.createConnection.handler} },
      },`
      : "";

    const filePath = this.writeTempFile(source.name, "");
    const code = `
      ${imports}
      export default definePlugin({
        name: "${source.name}",
        package: "${filePath}",
        setup(config) {
          return { ${connectionHook} };
        },
      });
    `;

    fs.writeFileSync(filePath, code);
    return filePath;
  }

  createRawModule(name: string, content: string): string {
    return this.writeTempFile(name, content);
  }

  async connect(params: { descriptors: PluginDescriptor[]; projectDir?: string }) {
    const { descriptors, projectDir: explicitProjectDir } = params;
    const manager = createConnectionManager();
    const projectDir = explicitProjectDir ?? path.dirname(descriptors[0].package);
    const payload = await manager.getOrCreateFromPlugins(descriptors, projectDir);
    this.connections.push(payload.sql);
    return {
      payload,
      reconnect: () => manager.getOrCreateFromPlugins(descriptors, projectDir),
    };
  }

  private writeTempFile(name: string, content: string) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `safeql-test-${name}-`));
    const filePath = path.join(dir, `${name}.ts`);
    fs.writeFileSync(filePath, content);
    this.tempDirs.push(dir);
    return filePath;
  }
}
