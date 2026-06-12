// Linter only — importing from the "eslint" barrel pulls in the ESLint class (fs globbing,
// glob-parent) which can't run in the browser. eslint-linter-browserify is the Linter alone.
import { Linter } from "eslint-linter-browserify";
import type { ESLint, Linter as LinterTypes } from "eslint";
import * as tsParser from "@typescript-eslint/parser";
import { rules } from "@ts-safeql/eslint-plugin";
import type { PlaygroundConfig } from "./playground-config";
import { createTsProgram } from "./ts-vfs";

// typescript-eslint's RuleModule and ESLint core's Plugin type don't line up structurally;
// this is the standard ESLint-API boundary cast.
const safeqlPlugin = { rules } as unknown as ESLint.Plugin;
const tseslintParser = tsParser as unknown as LinterTypes.Parser;

export interface EngineDiagnostic {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  message: string;
  ruleId: string | null;
  // ESLint autofix as character offsets into the source, when the rule provides one.
  fix?: { from: number; to: number; text: string };
}

export interface LintInput {
  code: string;
  databaseUrl: string;
  config: PlaygroundConfig;
}

const linter = new Linter();

// Map the playground's config to the rule's connection options. fieldTransform + overrides ride
// along to `generate` via the worker params the rule builds, so the whole config takes effect.
function toRuleConnection(databaseUrl: string, config: PlaygroundConfig) {
  return {
    databaseUrl,
    targets: [
      {
        tag: config.tag,
        fieldTransform: config.fieldTransform,
        skipTypeAnnotations: config.skipTypeAnnotations,
      },
    ],
    overrides: config.overrides,
    nullAsOptional: config.nullAsOptional,
    nullAsUndefined: config.nullAsUndefined,
  };
}

// Reused across lints so TypeScript can incrementally rebuild instead of re-parsing lib files.
let lastProgram: import("typescript").Program | undefined;

export function lintWithRealRule(input: LintInput): EngineDiagnostic[] {
  const { program, filename } = createTsProgram(input.code, lastProgram);
  lastProgram = program;

  const messages = linter.verify(
    input.code,
    {
      files: ["**/*.ts"],
      languageOptions: {
        parser: tseslintParser,
        parserOptions: {
          programs: [program],
          project: false,
          ecmaVersion: 2020,
          sourceType: "module",
        },
      },
      plugins: { "@ts-safeql": safeqlPlugin },
      rules: {
        "@ts-safeql/check-sql": [
          "error",
          { connections: [toRuleConnection(input.databaseUrl, input.config)] },
        ],
      },
    },
    filename,
  );

  return messages.map((message) => ({
    line: message.line,
    column: message.column,
    endLine: message.endLine ?? message.line,
    endColumn: message.endColumn ?? message.column,
    message: message.message,
    ruleId: message.ruleId,
    fix: message.fix
      ? { from: message.fix.range[0], to: message.fix.range[1], text: message.fix.text }
      : undefined,
  }));
}
