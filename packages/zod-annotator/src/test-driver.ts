import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import parser, { createProgram } from "@typescript-eslint/parser";
import { TSESLint, type ParserServices, type TSESTree } from "@typescript-eslint/utils";
import type { PluginResolvedTarget } from "@ts-safeql/plugin-utils";
import { createZodAnnotator } from "./annotator";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE_TSCONFIG = path.join(PACKAGE_ROOT, "tsconfig.json");

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
  private readonly tmpDir: string;
  private readonly testFilePath: string;
  private readonly tsconfigPath: string;

  constructor() {
    // Create temp directory inside the package root
    const tmpRoot = path.join(PACKAGE_ROOT, ".test-tmp");
    fs.mkdirSync(tmpRoot, { recursive: true });
    this.tmpDir = tmpRoot;
    this.testFilePath = path.join(this.tmpDir, "test.ts");
    this.tsconfigPath = path.join(this.tmpDir, "tsconfig.json");

    // Extend the package tsconfig to inherit lib resolution
    fs.writeFileSync(
      this.tsconfigPath,
      JSON.stringify(
        {
          extends: path.relative(this.tmpDir, PACKAGE_TSCONFIG),
          compilerOptions: {
            noEmit: true,
            incremental: false,
            tsBuildInfoFile: "./.tsbuildinfo",
          },
          include: ["./test.ts"],
        },
        null,
        2,
      ),
    );

    // Symlink node_modules for pnpm package resolution
    const srcNodeModules = path.join(PACKAGE_ROOT, "node_modules");
    const dstNodeModules = path.join(this.tmpDir, "node_modules");
    if (fs.existsSync(srcNodeModules) && !fs.existsSync(dstNodeModules)) {
      fs.symlinkSync(srcNodeModules, dstNodeModules);
    }
  }

  run(params: RunParams) {
    const source = this.buildSource(params);
    fs.writeFileSync(this.testFilePath, source);

    // Create program anchored to PACKAGE_ROOT to properly resolve TypeScript libs
    const program = createProgram(this.tsconfigPath, PACKAGE_ROOT);

    const { ast, services } = parser.parseForESLint(source, {
      filePath: this.testFilePath,
      programs: [program],
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
