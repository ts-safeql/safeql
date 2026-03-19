import fs from "fs";
import os from "os";
import path from "path";
import type { ParserServices, TSESTree } from "@typescript-eslint/utils";
import type { SafeQLPlugin } from "./index";

export interface PluginTestDriverOptions {
  plugin: SafeQLPlugin;
  /** Directory with node_modules for type resolution. Defaults to cwd. */
  projectDir?: string;
}

export type ToSQLResult = { sql: string } | { skipped: true };

/**
 * Black-box test driver for SafeQL plugin hooks.
 *
 * Given source code, it parses it with a real TypeScript type checker,
 * runs onTarget/onExpression hooks, and returns the SQL SafeQL would produce.
 */
export class PluginTestDriver {
  private readonly plugin: SafeQLPlugin;
  private readonly tmpDir: string;
  private readonly testFilePath: string;
  private readonly tsconfigPath: string;

  constructor(options: PluginTestDriverOptions) {
    this.plugin = options.plugin;
    const projectDir = options.projectDir ?? process.cwd();

    this.tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "safeql-hook-test-"));
    this.testFilePath = path.join(this.tmpDir, "test.ts");
    this.tsconfigPath = path.join(this.tmpDir, "tsconfig.json");

    const srcNodeModules = path.join(projectDir, "node_modules");
    const dstNodeModules = path.join(this.tmpDir, "node_modules");
    if (fs.existsSync(srcNodeModules) && !fs.existsSync(dstNodeModules)) {
      fs.symlinkSync(srcNodeModules, dstNodeModules);
    }

    fs.writeFileSync(
      this.tsconfigPath,
      JSON.stringify({
        compilerOptions: {
          strict: true,
          target: "ES2022",
          module: "ES2022",
          moduleResolution: "bundler",
          esModuleInterop: true,
          skipLibCheck: true,
        },
        include: ["test.ts"],
      }),
    );
  }

  toSQL(source: string): ToSQLResult {
    fs.writeFileSync(this.testFilePath, source);

    const { parseForESLint } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@typescript-eslint/parser") as typeof import("@typescript-eslint/parser");

    const { ast, services } = parseForESLint(source, {
      filePath: this.testFilePath,
      project: this.tsconfigPath,
      loc: true,
      range: true,
      comment: false,
      jsxPragma: null,
    });

    const checker = (services as ParserServices).program?.getTypeChecker();
    const nodeMap = (services as ParserServices).esTreeNodeToTSNodeMap;

    setParentPointers(ast);

    const allTemplates = findAllTaggedTemplates(ast);
    if (allTemplates.length === 0) {
      throw new Error("No TaggedTemplateExpression found in source");
    }

    const parserServices = services as ParserServices;
    const targetCtx = checker ? { checker, parser: parserServices } : undefined;

    let taggedTemplate: TSESTree.TaggedTemplateExpression | undefined;
    if (targetCtx && this.plugin.onTarget) {
      for (const t of allTemplates) {
        const result = this.plugin.onTarget({ node: t, context: targetCtx });
        if (result !== undefined && result !== false) {
          taggedTemplate = t;
        }
      }
    }

    if (!taggedTemplate) {
      return { skipped: true };
    }

    const { quasis, expressions } = taggedTemplate.quasi;
    let sql = "";

    for (let i = 0; i < quasis.length; i++) {
      sql += quasis[i].value.raw;

      if (i < expressions.length) {
        const expr = expressions[i];
        const tsTypeText = getTypeText(expr, checker, nodeMap);

        const context = {
          precedingSQL: sql,
          tsTypeText,
          checker: checker!,
          tsNode: nodeMap!.get(expr),
          tsType: checker!.getTypeAtLocation(nodeMap!.get(expr)),
        };

        const result = this.plugin.onExpression?.({ node: expr, context });

        if (typeof result === "string") {
          sql += result;
        } else if (result === false) {
          sql += "/* skipped */";
        } else {
          sql += `$${i + 1}`;
        }
      }
    }

    return { sql };
  }

  teardown(): void {
    fs.rmSync(this.tmpDir, { recursive: true, force: true });
  }
}

function findAllTaggedTemplates(node: TSESTree.Node): TSESTree.TaggedTemplateExpression[] {
  const results: TSESTree.TaggedTemplateExpression[] = [];

  if (node.type === "TaggedTemplateExpression") {
    results.push(node);
  }

  for (const key of Object.keys(node)) {
    if (key === "parent") continue;
    const value = (node as unknown as Record<string, unknown>)[key];

    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child === "object" && "type" in child) {
          results.push(...findAllTaggedTemplates(child as TSESTree.Node));
        }
      }
    } else if (value && typeof value === "object" && "type" in value) {
      results.push(...findAllTaggedTemplates(value as TSESTree.Node));
    }
  }

  return results;
}

function setParentPointers(node: TSESTree.Node, parent?: TSESTree.Node): void {
  if (parent) (node as { parent?: TSESTree.Node }).parent = parent;
  for (const key of Object.keys(node)) {
    if (key === "parent") continue;
    const value = (node as unknown as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child === "object" && "type" in child) {
          setParentPointers(child as TSESTree.Node, node);
        }
      }
    } else if (value && typeof value === "object" && "type" in value) {
      setParentPointers(value as TSESTree.Node, node);
    }
  }
}

function getTypeText(
  expr: TSESTree.Expression,
  checker: import("typescript").TypeChecker | undefined,
  nodeMap: ParserServices["esTreeNodeToTSNodeMap"] | undefined,
): string {
  if (!checker || !nodeMap) return "unknown";

  try {
    const tsNode = nodeMap.get(expr);
    const tsType = checker.getTypeAtLocation(tsNode);
    return checker.typeToString(tsType);
  } catch {
    return "unknown";
  }
}
