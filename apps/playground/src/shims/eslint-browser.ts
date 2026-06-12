// Browser replacement for the `eslint` barrel. Re-exports the real browser Linter and provides
// version-bearing stubs for the classes @typescript-eslint/utils references at module load
// (ESLint / LegacyESLint / RuleTester / SourceCode) — none of which we actually use.
import { Linter } from "eslint-linter-browserify";

// @typescript-eslint/utils only reads ESLint.version for a compatibility gate. Report the version
// of the browser Linter that actually runs so the two can't drift, falling back to its major.
const version: string = (Linter as unknown as { version?: string }).version ?? "10.0.0";

class ESLint {
  static version = version;
}

class LegacyESLint {
  static version = version;
}

class RuleTester {}
class SourceCode {}

export const builtinRules = new Map<string, unknown>();

export { Linter, ESLint, LegacyESLint, RuleTester, SourceCode, version };

export default { Linter, ESLint, LegacyESLint, RuleTester, SourceCode, version, builtinRules };
