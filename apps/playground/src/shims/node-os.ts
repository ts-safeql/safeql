// Minimal `os` polyfill. typescript / typescript-eslint probe os.platform / EOL at load.
export function platform(): string {
  return "browser";
}

export function homedir(): string {
  return "/";
}

export function tmpdir(): string {
  return "/tmp";
}

export function cpus(): unknown[] {
  return [];
}

export function release(): string {
  return "";
}

export const EOL = "\n";

export default { platform, homedir, tmpdir, cpus, release, EOL };
