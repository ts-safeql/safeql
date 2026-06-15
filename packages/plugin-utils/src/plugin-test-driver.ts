import fs from "fs";
import os from "os";
import path from "path";
import parser from "@typescript-eslint/parser";
import type ts from "typescript";
import type { ParserServices, TSESTree } from "@typescript-eslint/utils";
import type { SafeQLPlugin } from "./index";

export interface PluginTestDriverOptions {
  plugin: SafeQLPlugin;
  projectDir: string;
  /**
   * Terminal method names that mark a builder `CallExpression` as the query to
   * resolve via `toBuilderSQL`. Defaults to the common set; override for an ORM
   * with different terminals.
   */
  terminalMethods?: string[];
}

export type ToSQLResult = { sql: string } | { skipped: true };

const DEFAULT_TERMINAL_METHODS = [
  "execute",
  "executeTakeFirst",
  "executeTakeFirstOrThrow",
  "compile",
  "stream",
];

export class PluginTestDriver {
  private readonly plugin: SafeQLPlugin;
  private readonly terminalMethods: Set<string>;
  private readonly tmpDir: string;
  private readonly testFilePath: string;
  private readonly tsconfigPath: string;

  constructor(options: PluginTestDriverOptions) {
    this.plugin = options.plugin;
    this.terminalMethods = new Set(options.terminalMethods ?? DEFAULT_TERMINAL_METHODS);

    this.tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "safeql-hook-test-"));
    this.testFilePath = path.join(this.tmpDir, "test.ts");
    this.tsconfigPath = path.join(this.tmpDir, "tsconfig.json");

    const srcNodeModules = path.join(options.projectDir, "node_modules");
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

    const { ast, services } = parser.parseForESLint(source, {
      filePath: this.testFilePath,
      project: this.tsconfigPath,
      loc: true,
      range: true,
      comment: false,
      jsxPragma: null,
    });

    const checker = services.program?.getTypeChecker();
    const nodeMap = services.esTreeNodeToTSNodeMap;

    setParentPointers(ast);

    const allTemplates = findAllTaggedTemplates(ast);
    if (allTemplates.length === 0) {
      throw new Error("No TaggedTemplateExpression found in source");
    }

    if (!checker) {
      return { skipped: true };
    }

    let taggedTemplate: TSESTree.TaggedTemplateExpression | undefined;
    if (this.plugin.onTarget) {
      for (const t of allTemplates) {
        const result = this.plugin.onTarget({
          node: t,
          context: { checker, parser: services },
        });
        if (result !== undefined && result !== false) {
          taggedTemplate = t;
        }
      }
    }

    if (!taggedTemplate) {
      return { skipped: true };
    }

    return { sql: this.buildSQL(taggedTemplate, checker, nodeMap) };
  }

  /**
   * Drive the rule-only `resolveQuery` hook over the outermost terminal-method
   * `CallExpression` in `source` (e.g. `db.selectFrom(...).execute()`). Mirrors
   * how the eslint rule invokes the hook, so a plugin's builder path can be
   * unit-tested without a real database.
   */
  toBuilderSQL(source: string): ToSQLResult {
    fs.writeFileSync(this.testFilePath, source);

    const { ast, services } = parser.parseForESLint(source, {
      filePath: this.testFilePath,
      project: this.tsconfigPath,
      loc: true,
      range: true,
      comment: false,
      jsxPragma: null,
    });

    const checker = services.program?.getTypeChecker();
    const nodeMap = services.esTreeNodeToTSNodeMap;

    setParentPointers(ast);

    if (!checker || !this.plugin.resolveQuery) {
      return { skipped: true };
    }

    const calls = findAllCallExpressions(ast);
    const terminal = calls.find((call) => this.isTerminalCallExpression(call));
    if (!terminal) {
      throw new Error("No terminal builder CallExpression found in source");
    }

    const tsNode = nodeMap.get(terminal);
    const tsType = checker.getTypeAtLocation(tsNode);

    const result = this.plugin.resolveQuery({
      checker,
      parser: services,
      precedingSQL: "",
      tsNode,
      tsType,
      tsTypeText: checker.typeToString(tsType),
    });

    return result === "skip" ? { skipped: true } : { sql: result.text };
  }

  private isTerminalCallExpression(node: TSESTree.CallExpression): boolean {
    return (
      node.callee.type === "MemberExpression" &&
      !node.callee.computed &&
      node.callee.property.type === "Identifier" &&
      this.terminalMethods.has(node.callee.property.name)
    );
  }

  private buildSQL(
    template: TSESTree.TaggedTemplateExpression,
    checker: ts.TypeChecker,
    nodeMap: ParserServices["esTreeNodeToTSNodeMap"],
  ): string {
    const { quasis, expressions } = template.quasi;
    let sql = "";

    for (let i = 0; i < quasis.length; i++) {
      sql += quasis[i].value.raw;

      if (i >= expressions.length) continue;

      const expr = expressions[i];
      const tsNode = nodeMap.get(expr);
      const tsType = checker.getTypeAtLocation(tsNode);

      const context = {
        precedingSQL: sql,
        tsTypeText: checker.typeToString(tsType),
        checker,
        tsNode,
        tsType,
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

    return sql;
  }

  teardown(): void {
    fs.rmSync(this.tmpDir, { recursive: true, force: true });
  }
}

function isASTNode(value: unknown): value is TSESTree.Node {
  return typeof value === "object" && value !== null && "type" in value;
}

function getNodeValues(node: TSESTree.Node): unknown[] {
  return Object.entries(node)
    .filter(([k]) => k !== "parent")
    .map(([, v]) => v);
}

function forEachChild(node: TSESTree.Node, fn: (child: TSESTree.Node) => void): void {
  for (const value of getNodeValues(node)) {
    if (Array.isArray(value)) {
      for (const child of value) {
        if (isASTNode(child)) fn(child);
      }
    } else if (isASTNode(value)) {
      fn(value);
    }
  }
}

function findAllTaggedTemplates(node: TSESTree.Node): TSESTree.TaggedTemplateExpression[] {
  const results: TSESTree.TaggedTemplateExpression[] = [];

  if (node.type === "TaggedTemplateExpression") {
    results.push(node);
  }

  forEachChild(node, (child) => results.push(...findAllTaggedTemplates(child)));

  return results;
}

function findAllCallExpressions(node: TSESTree.Node): TSESTree.CallExpression[] {
  const results: TSESTree.CallExpression[] = [];

  if (node.type === "CallExpression") {
    results.push(node);
  }

  forEachChild(node, (child) => results.push(...findAllCallExpressions(child)));

  return results;
}

function setParentPointers(node: TSESTree.Node, parent?: TSESTree.Node): void {
  if (parent) {
    node.parent = parent;
  }

  forEachChild(node, (child) => setParentPointers(child, node));
}
