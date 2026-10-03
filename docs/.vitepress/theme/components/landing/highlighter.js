import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import ts from "shiki/langs/typescript.mjs";

const safeqlTheme = {
  name: "safeql-dark",
  type: "dark",
  colors: { "editor.background": "#161618", "editor.foreground": "#c7c7cc" },
  settings: [
    { settings: { background: "#161618", foreground: "#c7c7cc" } },
    { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: "#5e5e66", fontStyle: "italic" } },
    { scope: ["keyword", "storage.type", "storage.modifier", "keyword.control", "keyword.operator.new", "keyword.operator.expression"], settings: { foreground: "#8aa0c8" } },
    { scope: ["string", "string.template", "punctuation.definition.string", "string.quoted"], settings: { foreground: "#98aa82" } },
    { scope: ["entity.name.function", "support.function", "meta.function-call", "variable.function"], settings: { foreground: "#8aa0c8" } },
    { scope: ["entity.name.type", "support.type", "entity.name.class", "support.class", "entity.other.inherited-class"], settings: { foreground: "#6cb3c4" } },
    { scope: ["constant.numeric", "constant.language", "constant.language.boolean"], settings: { foreground: "#d9a05b" } },
    { scope: ["punctuation", "meta.brace", "punctuation.accessor", "punctuation.separator"], settings: { foreground: "#5e5e66" } },
    { scope: ["variable.other.property", "meta.object-literal.key", "support.type.property-name", "variable.object.property"], settings: { foreground: "#9cc0e8" } },
    { scope: ["variable", "variable.other", "meta.definition.variable"], settings: { foreground: "#c7c7cc" } },
  ],
};

const safeqlLightTheme = {
  name: "safeql-light",
  type: "light",
  colors: { "editor.background": "#ffffff", "editor.foreground": "#1f2328" },
  settings: [
    { settings: { background: "#ffffff", foreground: "#1f2328" } },
    { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: "#6a737d", fontStyle: "italic" } },
    { scope: ["keyword", "storage.type", "storage.modifier", "keyword.control", "keyword.operator.new", "keyword.operator.expression"], settings: { foreground: "#3b5b92" } },
    { scope: ["string", "string.template", "punctuation.definition.string", "string.quoted"], settings: { foreground: "#557a35" } },
    { scope: ["entity.name.function", "support.function", "meta.function-call", "variable.function"], settings: { foreground: "#3b5b92" } },
    { scope: ["entity.name.type", "support.type", "entity.name.class", "support.class", "entity.other.inherited-class"], settings: { foreground: "#1f7a8c" } },
    { scope: ["constant.numeric", "constant.language", "constant.language.boolean"], settings: { foreground: "#b06a2a" } },
    { scope: ["punctuation", "meta.brace", "punctuation.accessor", "punctuation.separator"], settings: { foreground: "#8a8a90" } },
    { scope: ["variable.other.property", "meta.object-literal.key", "support.type.property-name", "variable.object.property"], settings: { foreground: "#3b6ea5" } },
    { scope: ["variable", "variable.other", "meta.definition.variable"], settings: { foreground: "#1f2328" } },
  ],
};

let promise = null;

export function getHighlighter() {
  if (!promise) {
    promise = createHighlighterCore({
      themes: [safeqlTheme, safeqlLightTheme],
      langs: [ts],
      engine: createJavaScriptRegexEngine(),
    });
  }
  return promise;
}
