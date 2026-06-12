// Minimal POSIX `path` polyfill for the browser. The rule + eslint touch a handful of path
// helpers at load/lint time; full Node semantics aren't needed (no real filesystem here).
export function basename(filePath: string, ext?: string): string {
  if (filePath === "/") {
    return "/";
  }
  // Strip trailing slashes first, like Node, so basename("/foo/bar/") is "bar".
  const parts = (filePath.replace(/\/+$/, "") || filePath).split(/[/\\]/);
  const base = parts[parts.length - 1] ?? "";
  return ext && base.endsWith(ext) ? base.slice(0, -ext.length) : base;
}

export function normalize(filePath: string): string {
  const isAbsolutePath = filePath.startsWith("/");
  const parts: string[] = [];

  for (const part of filePath.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (parts.length > 0 && parts[parts.length - 1] !== "..") parts.pop();
      else if (!isAbsolutePath) parts.push("..");
    } else {
      parts.push(part);
    }
  }

  const joined = (isAbsolutePath ? "/" : "") + parts.join("/");
  return joined === "" ? (isAbsolutePath ? "/" : ".") : joined;
}

export function dirname(filePath: string): string {
  if (filePath === "") return ".";

  let normalized = filePath;
  while (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }

  const index = normalized.lastIndexOf("/");
  if (index === -1) return ".";
  if (index === 0) return "/"; // covers "/" and "/file" → "/"
  return normalized.slice(0, index);
}

export function extname(filePath: string): string {
  const base = basename(filePath);
  const index = base.lastIndexOf(".");
  return index > 0 ? base.slice(index) : "";
}

export function join(...segments: string[]): string {
  return normalize(segments.filter((segment) => segment.length > 0).join("/"));
}

export function resolve(...segments: string[]): string {
  let resolved = "";
  for (const segment of segments) {
    resolved = segment.startsWith("/") ? segment : `${resolved}/${segment}`;
  }
  return normalize(resolved.startsWith("/") ? resolved : `/${resolved}`);
}

export function isAbsolute(filePath: string): boolean {
  return filePath.startsWith("/");
}

export function relative(from: string, to: string): string {
  const fromParts = from.split("/").filter(Boolean);
  const toParts = to.split("/").filter(Boolean);

  let common = 0;
  while (
    common < fromParts.length &&
    common < toParts.length &&
    fromParts[common] === toParts[common]
  ) {
    common++;
  }

  const up = fromParts.slice(common).map(() => "..");
  const rel = [...up, ...toParts.slice(common)].join("/");
  // Match Node: identical paths are ".", not "" (callers use the result as a truthy "differs" check).
  return rel === "" ? "." : rel;
}

export const sep = "/";
export const delimiter = ":";

const path = {
  basename,
  normalize,
  dirname,
  extname,
  join,
  resolve,
  isAbsolute,
  relative,
  sep,
  delimiter,
};

export const posix = path;
export const win32 = path;
export default path;
