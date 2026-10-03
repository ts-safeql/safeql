import fs from "fs";
import os from "os";
import path from "path";
import parser from "@typescript-eslint/parser";
import type ts from "typescript";
import type { ParserServices, TSESTree } from "@typescript-eslint/utils";
import { matchesQueryNodeSelector, type SafeQLPlugin } from "./index";

export interface PluginTestDriverOptions {
  plugin: SafeQLPlugin;
  projectDir: string;
}

export type ToSQLResult = { sql: string } | { skipped: true };

export class PluginTestDriver {
  private readonly plugin: SafeQLPlugin;
  private readonly tmpDir: string;
  private parseCount = 0;

  constructor(options: PluginTestDriverOptions) {
    this.plugin = options.plugin;

    this.tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "safeql-hook-test-"));

    const srcNodeModules = path.join(options.projectDir, "node_modules");
    const dstNodeModules = path.join(this.tmpDir, "node_modules");
    if (fs.existsSync(srcNodeModules) && !fs.existsSync(dstNodeModules)) {
      fs.symlinkSync(srcNodeModules, dstNodeModules);
    }
  }

  private parse(source: string): ReturnType<typeof parser.parseForESLint> {
    const id = this.parseCount++;
    const fileName = `test-${id}.ts`;
    const filePath = path.join(this.tmpDir, fileName);
    const tsconfigPath = path.join(this.tmpDir, `tsconfig-${id}.json`);

    fs.writeFileSync(filePath, source);
    fs.writeFileSync(
      tsconfigPath,
      JSON.stringify({
        compilerOptions: {
          strict: true,
          target: "ES2022",
          module: "ES2022",
          moduleResolution: "bundler",
          esModuleInterop: true,
          skipLibCheck: true,
        },
        include: [fileName],
      }),
    );

    return parser.parseForESLint(source, {
      filePath,
      project: tsconfigPath,
      loc: true,
      range: true,
      comment: false,
      jsxPragma: null,
    });
  }

  toSQL(source: string): ToSQLResult {
    const { ast, services } = this.parse(source);

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

  toBuilderSQL(source: string): ToSQLResult {
    const { ast, services } = this.parse(source);

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
    return (this.plugin.queryNodeKinds ?? []).some((selector) =>
      matchesQueryNodeSelector(node, selector),
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
