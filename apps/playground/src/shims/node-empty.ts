// Stub for `fs` / `module`. The check-sql rule imports these at module load but only calls
// into them on the migrations path, which the browser playground never takes (databaseUrl only).
const noop = () => undefined;

const stat = {
  isFile: () => false,
  isDirectory: () => false,
  isSymbolicLink: () => false,
};

const fsLike = {
  readdirSync: () => [] as string[],
  statSync: () => stat,
  lstatSync: () => stat,
  // Report package.json as present so the rule's locateNearestPackageJsonDir (which walks up
  // until it finds one and has no root guard) terminates at the virtual file's directory.
  existsSync: (filePath: string) =>
    typeof filePath === "string" && filePath.endsWith("package.json"),
  readFileSync: () => "",
  realpathSync: (filePath: string) => filePath,
  promises: { readFile: async () => "", stat: async () => stat, readdir: async () => [] },
  createRequire: () => () => ({}),
};

export const promises = fsLike.promises;
export const readdirSync = fsLike.readdirSync;
export const statSync = fsLike.statSync;
export const lstatSync = fsLike.lstatSync;
export const existsSync = fsLike.existsSync;
export const readFileSync = fsLike.readFileSync;
export const realpathSync = fsLike.realpathSync;
export const createRequire = fsLike.createRequire;
export { noop };
export default fsLike;
