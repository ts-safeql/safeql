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
  for (const statement of sourceFile.statements) {
    if (!TS.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (TS.isIdentifier(declaration.name) && declaration.name.text === variableName) {
        assert(declaration.initializer);
        return declaration.initializer;
      }
    }
  }
  throw new Error(`variable ${variableName} not found`);
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
