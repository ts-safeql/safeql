import fs from "fs";
import os from "os";
import path from "path";
import parser from "@typescript-eslint/parser";
import { TSESLint, type ParserServices, type TSESTree } from "@typescript-eslint/utils";
import type { PluginResolvedTarget } from "@ts-safeql/plugin-utils";
import { createZodAnnotator } from "./annotator";

export type RunParams = {
  input: string;
  output: PluginResolvedTarget;
  imports?: string[];
  declarations?: string[];
  schemaArgIndex?: number;
};

const DEFAULT_IMPORTS = ['import { z } from "zod";'];

const DEFAULT_DECLARATIONS = [
  `declare function query(...args: unknown[]): (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => unknown;`,
];

export class AnnotatorTestDriver {
  private readonly tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "safeql-zod-annotator-"));
  private readonly testFilePath = path.join(this.tmpDir, "test.ts");
  private readonly tsconfigPath = path.join(this.tmpDir, "tsconfig.json");

  constructor() {
    const srcNodeModules = path.join(process.cwd(), "node_modules");
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

  run(params: RunParams) {
    const source = this.buildSource(params);
    fs.writeFileSync(this.testFilePath, source);

    const { ast, services } = parser.parseForESLint(source, {
      filePath: this.testFilePath,
      project: this.tsconfigPath,
      loc: true,
      range: true,
      comment: false,
      jsxPragma: null,
    });

    const parserServices = services as ParserServices;
    const checker = parserServices.program?.getTypeChecker();

    if (!checker) {
      throw new Error("Expected TypeScript checker to be available");
    }

    const node = findFirstTaggedTemplate(ast);
    if (!node) {
      throw new Error("Expected a tagged template expression in the test source");
    }

    const annotator =
      params.schemaArgIndex === undefined
        ? createZodAnnotator()
        : createZodAnnotator({ schemaArgIndex: params.schemaArgIndex });

    return annotator({
      node,
      output: params.output,
      checker,
      parser: parserServices,
      sourceCode: new TSESLint.SourceCode(source, ast),
      getComparableString: () => "",
    });
  }

  private buildSource(params: RunParams) {
    return [
      ...DEFAULT_IMPORTS,
      ...(params.imports ?? []),
      ...DEFAULT_DECLARATIONS,
      ...(params.declarations ?? []),
      params.input,
    ].join("\n\n");
  }

  teardown() {
    fs.rmSync(this.tmpDir, { recursive: true, force: true });
  }
}

function findFirstTaggedTemplate(
  node: TSESTree.Node,
): TSESTree.TaggedTemplateExpression | undefined {
  if (node.type === "TaggedTemplateExpression") {
    return node;
  }

  for (const key of Object.keys(node)) {
    const value = (node as unknown as Record<string, unknown>)[key];

    if (Array.isArray(value)) {
      for (const child of value) {
        if (isNode(child)) {
          const found = findFirstTaggedTemplate(child);
          if (found) return found;
        }
      }
      continue;
    }

    if (isNode(value)) {
      const found = findFirstTaggedTemplate(value);
      if (found) return found;
    }
  }

  return undefined;
}

function isNode(value: unknown): value is TSESTree.Node {
  return Boolean(value && typeof value === "object" && "type" in value);
}
