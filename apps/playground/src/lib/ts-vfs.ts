import ts from "typescript";

// Bundle TypeScript's lib.*.d.ts locally — fetching them from a CDN would be blocked by the
// COEP `require-corp` we need for SharedArrayBuffer.
const libSources = import.meta.glob("/node_modules/typescript/lib/lib*.d.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export const PLAYGROUND_FILE = "/playground.ts";
const PRELUDE_FILE = "/safeql-playground-prelude.d.ts";

// Lib files live under node_modules so the rule's getResolvedTargetByTypeNode treats library
// types (Date, etc.) as named references instead of expanding their members — matching a real
// tsconfig environment (it keys off `filePath.includes("node_modules")`).
const LIB_DIR = "/node_modules/typescript/lib";

// Minimal ambient declarations so the user's `sql`/`conn.query` tagged templates type-check;
// the real result types come from SafeQL, not these.
const PRELUDE = `
export {};
declare global {
  function sql<T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  const conn: {
    query<T = unknown>(promise: Promise<T> | T): Promise<T>;
  };
}
`;

const compilerOptions: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2020,
  lib: ["lib.es2020.d.ts", "lib.dom.d.ts"],
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  skipLibCheck: true,
  noEmit: true,
};

function buildFileMap(): Map<string, string> {
  const map = new Map<string, string>();

  for (const [filePath, content] of Object.entries(libSources)) {
    const name = filePath.split("/").pop();
    if (name !== undefined) {
      map.set(`${LIB_DIR}/${name}`, content);
    }
  }

  return map;
}

const baseFiles = buildFileMap();

// The lib (and prelude) files never change between lints, so parse each one once and reuse the
// SourceFile across calls. Only the playground file is re-parsed per keystroke. This — together
// with the oldProgram hint below — lets TypeScript skip re-parsing the large lib.*.d.ts files on
// every debounced lint.
const sourceFileCache = new Map<string, ts.SourceFile>();

function createHost(fsMap: Map<string, string>): ts.CompilerHost {
  return {
    fileExists: (fileName) => fsMap.has(fileName),
    readFile: (fileName) => fsMap.get(fileName),
    getSourceFile: (fileName, languageVersion) => {
      const content = fsMap.get(fileName);
      if (content === undefined) {
        return undefined;
      }
      if (fileName === PLAYGROUND_FILE) {
        return ts.createSourceFile(fileName, content, languageVersion, true);
      }
      let sourceFile = sourceFileCache.get(fileName);
      if (sourceFile === undefined) {
        sourceFile = ts.createSourceFile(fileName, content, languageVersion, true);
        sourceFileCache.set(fileName, sourceFile);
      }
      return sourceFile;
    },
    getDefaultLibFileName: (options) => `${LIB_DIR}/${ts.getDefaultLibFileName(options)}`,
    getDefaultLibLocation: () => LIB_DIR,
    writeFile: () => undefined,
    getCurrentDirectory: () => "/",
    getCanonicalFileName: (fileName) => fileName,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
    getDirectories: () => [],
    readDirectory: () => [],
  };
}

export interface TsProgramResult {
  program: ts.Program;
  filename: string;
}

export function createTsProgram(code: string, oldProgram?: ts.Program): TsProgramResult {
  const fsMap = new Map(baseFiles);
  fsMap.set(PRELUDE_FILE, PRELUDE);
  fsMap.set(PLAYGROUND_FILE, code);

  const program = ts.createProgram({
    rootNames: [PRELUDE_FILE, PLAYGROUND_FILE],
    options: compilerOptions,
    host: createHost(fsMap),
    oldProgram,
  });

  return { program, filename: PLAYGROUND_FILE };
}
