/* eslint-disable no-constant-binary-expression */
/**
 * Determines if the current process is running within a code editor environment.
 *
 * Returns `false` if running in a CI environment or within Git hooks or lint-staged scripts. Otherwise, returns `true` if any environment variables associated with popular editors (such as VS Code, JetBrains IDEs, or Vim/Neovim) are present.
 *
 * @returns `true` if the process is likely running inside a code editor environment; otherwise, `false`.
 */
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
