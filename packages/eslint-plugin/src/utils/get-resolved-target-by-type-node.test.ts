import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ParserServices, TSESTree } from "@typescript-eslint/utils";
import ts from "typescript";
import {
  getResolvedTargetByType,
  ExpectedResolvedTarget,
  ExpectedResolvedTargetEntry,
} from "./get-resolved-target-by-type-node";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("getResolvedTargetByType", () => {
  let tempDir: string;
  let filePath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "safeql-type-at-location-"));
    filePath = path.join(tempDir, "fixture.ts");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("accepts a resolved TypeScript type and preserves object members", () => {
    const source = `
      type Person = {
        id: number;
        name: string | null;
      };
    `;

    fs.writeFileSync(filePath, source);

    const program = ts.createProgram({
      rootNames: [filePath],
      options: {
        strict: true,
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
      },
      host: ts.createCompilerHost({
        strict: true,
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
      }),
    });

    const sourceFile = program.getSourceFile(filePath);
    if (!sourceFile) {
      throw new Error("Expected source file from synthetic fixture");
    }

    const checker = program.getTypeChecker();
    const typeAlias = sourceFile.statements.find(
      (statement): statement is ts.TypeAliasDeclaration => ts.isTypeAliasDeclaration(statement),
    );

    if (!typeAlias || !ts.isTypeAliasDeclaration(typeAlias)) {
      throw new Error("Expected type alias statement");
    }

    const resolved = checker.getTypeAtLocation(typeAlias.type);

    const comparable = getResolvedTargetByType({
      type: resolved,
      checker,
      parser: {
        esTreeNodeToTSNodeMap: {
          get: (node: TSESTree.Node | ts.Node) => node as ts.Node,
        },
      } as ParserServices,
      reservedTypes: new Set(["number", "string", "null"]),
      anchorNode: typeAlias.type,
    });

    expect(comparable).toMatchObject({
      kind: "object",
      value: [
        ["id", { kind: "type", value: "number" }],
        ["name", expect.objectContaining({ kind: "union" })],
      ],
    });

    expect(comparable.kind).toBe("object");

    if (comparable.kind !== "object") {
      return;
    }

    const nameType = comparable.value.find((entry: ExpectedResolvedTargetEntry) => {
      const [key] = entry;
      return key === "name";
    })?.[1];

    expect(nameType?.kind).toBe("union");

    if (nameType?.kind === "union") {
      const unionValues = nameType.value.map((entry: ExpectedResolvedTarget) => entry.value).sort();
      expect(unionValues).toEqual(["null", "string"]);
    }
  });
});
