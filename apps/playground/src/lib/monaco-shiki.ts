import { shikiToMonaco } from "@shikijs/monaco";
import * as monaco from "monaco-editor";
import { createHighlighterCore } from "shiki/core";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";
import jsonLang from "shiki/langs/json.mjs";
import sqlLang from "shiki/langs/sql.mjs";
import typescriptLang from "shiki/langs/typescript.mjs";
import { safeqlDarkTheme } from "./safeql-theme";

// Drive all Monaco editors with Shiki's TextMate grammars + a custom theme matching the
// playground palette, for consistent highlighting across TypeScript / SQL / JSON. We use the
// core API with explicit language imports rather than the full `shiki` bundle, so only the three
// grammars we use are shipped.
export const MONACO_THEME = safeqlDarkTheme.name as string;
const LANGUAGES = ["typescript", "sql", "json"] as const;

let setupPromise: Promise<void> | undefined;

async function doSetup(): Promise<void> {
  for (const language of LANGUAGES) {
    monaco.languages.register({ id: language });
  }
  const highlighter = await createHighlighterCore({
    themes: [safeqlDarkTheme],
    langs: [typescriptLang, sqlLang, jsonLang],
    engine: createOnigurumaEngine(import("shiki/wasm")),
  });
  shikiToMonaco(highlighter, monaco);
}

export function setupMonacoShiki(): Promise<void> {
  // Clear the cached promise on failure so a transient init error doesn't permanently disable
  // highlighting until a full page reload.
  setupPromise ??= doSetup().catch((error) => {
    setupPromise = undefined;
    throw error;
  });

  return setupPromise;
}
