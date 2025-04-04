/* eslint-disable no-constant-binary-expression */
// https://github.com/antfu/eslint-config/blob/de2d48d0f4409c66fccbf0872896f00c202f7bf1/src/utils.ts#L135
export function isInEditorEnv(): boolean {
  if (process.env.CI) return false;
  if (isInGitHooksOrLintStaged()) return false;
  return !!(
    false ||
    process.env.VSCODE_PID ||
    process.env.VSCODE_CWD ||
    process.env.JETBRAINS_IDE ||
    process.env.VIM ||
    process.env.NVIM
  );
}

export function isInGitHooksOrLintStaged(): boolean {
  return !!(
    false ||
    process.env.GIT_PARAMS ||
    process.env.VSCODE_GIT_COMMAND ||
    process.env.npm_lifecycle_script?.startsWith("lint-staged")
  );
}
