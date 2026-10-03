import { createRequire } from "node:module";

export const TS = createRequire(import.meta.url)("typescript") as typeof import("typescript");
