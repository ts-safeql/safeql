// Stub for `eslint/use-at-your-own-risk`. @typescript-eslint/utils imports the FlatESLint /
// LegacyESLint classes from here at module load; we only use the Linter, so empty stubs avoid
// loading eslint's node-coupled ESLint class (fs globbing, glob-parent).
export const builtinRules = new Map<string, unknown>();

export class FlatESLint {}
export class LegacyESLint {}

export function shouldUseFlatConfig(): boolean {
  return true;
}

export default { builtinRules, FlatESLint, LegacyESLint, shouldUseFlatConfig };
