import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import type * as ts from "typescript";
import { afterAll, describe, test } from "vitest";
import { getStaticValue, isImportedFrom, UNRESOLVED } from "./ast";
import { TS } from "./ts";

const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safeql-plugin-ast-"));

afterAll(() => fs.rmSync(rootDir, { recursive: true, force: true }));

function createProject(files: Record<string, string>) {
  const projectDir = fs.mkdtempSync(path.join(rootDir, "project-"));
  for (const [fileName, content] of Object.entries(files)) {
    const filePath = path.join(projectDir, fileName);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }

  const mainPath = path.join(projectDir, "main.ts");
  const program = TS.createProgram([mainPath], {
    strict: true,
    module: TS.ModuleKind.NodeNext,
    moduleResolution: TS.ModuleResolutionKind.NodeNext,
    noEmit: true,
  });
  const sourceFile = program.getSourceFile(mainPath);
  assert(sourceFile);

  return { checker: program.getTypeChecker(), sourceFile };
}

function getInitializerOf(sourceFile: ts.SourceFile, variableName: string): ts.Expression {
  const initializer = findVariableInitializer(sourceFile, variableName);
  if (!initializer) throw new Error(`variable ${variableName} not found`);
  return initializer;
}

function findVariableInitializer(node: ts.Node, variableName: string): ts.Expression | undefined {
  if (
    TS.isVariableDeclaration(node) &&
    TS.isIdentifier(node.name) &&
    node.name.text === variableName
  ) {
    return node.initializer;
  }

  return TS.forEachChild(node, (child) => findVariableInitializer(child, variableName));
}

describe("getStaticValue", () => {
  test("cyclic initializers resolve to UNRESOLVED instead of recursing forever", () => {
    const { checker, sourceFile } = createProject({
      "main.ts": "// @ts-nocheck\nconst a = b; const b = a; export const target = a;",
    });

    assert.equal(
      getStaticValue({ node: getInitializerOf(sourceFile, "target"), checker }),
      UNRESOLVED,
    );
  });

  test("the same symbol resolves independently in sibling positions", () => {
    const { checker, sourceFile } = createProject({
      "main.ts": "const value = 1; export const target = [value, value];",
    });

    assert.deepEqual(
      getStaticValue({ node: getInitializerOf(sourceFile, "target"), checker }),
      [1, 1],
    );
  });

  test("a destructuring default is not the value when the source is unknown", () => {
    const { checker, sourceFile } = createProject({
      "main.ts":
        "declare function make(): { a?: number }; const { a = 5 } = make(); export const target = a;",
    });

    assert.equal(
      getStaticValue({ node: getInitializerOf(sourceFile, "target"), checker }),
      UNRESOLVED,
    );
  });

  test("a parameter destructuring default is not the value of the parameter", () => {
    const { checker, sourceFile } = createProject({
      "main.ts":
        "export function f({ b = 7 }: { b?: number }) { const target = b; return target; }",
    });

    assert.equal(
      getStaticValue({ node: getInitializerOf(sourceFile, "target"), checker }),
      UNRESOLVED,
    );
  });

  test("a destructuring default is not the value when a spread may provide the key", () => {
    const { checker, sourceFile } = createProject({
      "main.ts":
        "declare const other: { a?: number }; const { a = 5 } = { ...other }; export const target = a;",
    });

    assert.equal(
      getStaticValue({ node: getInitializerOf(sourceFile, "target"), checker }),
      UNRESOLVED,
    );
  });

  test("a destructuring default applies when the object literal source lacks the key", () => {
    const { checker, sourceFile } = createProject({
      "main.ts": "// @ts-nocheck\nconst { a = 5 } = { b: 1 }; export const target = a;",
    });

    assert.equal(getStaticValue({ node: getInitializerOf(sourceFile, "target"), checker }), 5);
  });

  test("a destructuring default applies when the array literal source lacks the element", () => {
    const { checker, sourceFile } = createProject({
      "main.ts": "// @ts-nocheck\nconst [first, second = 5] = [1]; export const target = second;",
    });

    assert.equal(getStaticValue({ node: getInitializerOf(sourceFile, "target"), checker }), 5);
  });

  test("a destructuring default applies when a type assertion wraps the object literal source", () => {
    const { checker, sourceFile } = createProject({
      "main.ts": "const { a = 5 } = {} as { a?: number }; export const target = a;",
    });

    assert.equal(getStaticValue({ node: getInitializerOf(sourceFile, "target"), checker }), 5);
  });

  test("a destructuring default applies when a type assertion wraps the array literal source", () => {
    const { checker, sourceFile } = createProject({
      "main.ts": "const [first = 5] = [] as number[]; export const target = first;",
    });

    assert.equal(getStaticValue({ node: getInitializerOf(sourceFile, "target"), checker }), 5);
  });

  test("a destructuring default is not the value when an accessor provides the key", () => {
    const { checker, sourceFile } = createProject({
      "main.ts": "const { a = 5 } = { get a() { return 3; } }; export const target = a;",
    });

    assert.equal(
      getStaticValue({ node: getInitializerOf(sourceFile, "target"), checker }),
      UNRESOLVED,
    );
  });

  test("a destructuring default is not the value when an array spread may provide the element", () => {
    const { checker, sourceFile } = createProject({
      "main.ts":
        "declare const rest: number[]; const [first, second = 5] = [...rest]; export const target = second;",
    });

    assert.equal(
      getStaticValue({ node: getInitializerOf(sourceFile, "target"), checker }),
      UNRESOLVED,
    );
  });

  test("a destructuring default applies when the array literal source has a hole at the element", () => {
    const { checker, sourceFile } = createProject({
      "main.ts": "const [first = 5] = [, 1]; export const target = first;",
    });

    assert.equal(getStaticValue({ node: getInitializerOf(sourceFile, "target"), checker }), 5);
  });

  test("a destructured binding resolves to the bound value over its default", () => {
    const { checker, sourceFile } = createProject({
      "main.ts": "const { a = 5 } = { a: 3 }; export const target = a;",
    });

    assert.equal(getStaticValue({ node: getInitializerOf(sourceFile, "target"), checker }), 3);
  });
});

describe("isImportedFrom", () => {
  test("matches a symbol re-exported through a local module from its package", () => {
    const { checker, sourceFile } = createProject({
      "node_modules/some-lib/package.json": JSON.stringify({
        name: "some-lib",
        types: "index.d.ts",
      }),
      "node_modules/some-lib/index.d.ts": "export declare const tag: unknown;",
      "reexport.ts": 'export { tag } from "some-lib";',
      "main.ts": 'import { tag } from "./reexport.js"; export const target = tag;',
    });

    assert(
      isImportedFrom({
        node: getInitializerOf(sourceFile, "target"),
        checker,
        moduleName: "some-lib",
      }),
    );
  });
});
