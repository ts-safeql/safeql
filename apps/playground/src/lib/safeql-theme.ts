import type { ThemeRegistration } from "shiki";

// Dark theme matching the playground's original editor palette: near-black background, blue
// keywords/functions, green strings, amber numbers, muted-grey comments. (hex approximations of
// the oklch tokens, since Monaco themes require hex colors.)
export const safeqlDarkTheme: ThemeRegistration = {
  name: "safeql-dark",
  type: "dark",
  colors: {
    "editor.background": "#0e0f12",
    "editor.foreground": "#f3f4f6",
    "editorLineNumber.foreground": "#4b5563",
    "editorLineNumber.activeForeground": "#9aa0ab",
    "editor.selectionBackground": "#1f4b73",
    "editorCursor.foreground": "#5aa0f0",
  },
  tokenColors: [
    {
      scope: ["comment", "punctuation.definition.comment"],
      settings: { foreground: "#8b919e", fontStyle: "italic" },
    },
    {
      scope: ["keyword", "storage.type", "storage.modifier"],
      settings: { foreground: "#5aa0f0" },
    },
    {
      scope: ["string", "constant.other.database-name"],
      settings: { foreground: "#38bd92" },
    },
    {
      scope: ["constant.numeric", "constant.language"],
      settings: { foreground: "#d8aa57" },
    },
    {
      scope: ["entity.name.function", "support.function"],
      settings: { foreground: "#5aa0f0" },
    },
    {
      scope: ["variable", "entity.name.type", "support.type"],
      settings: { foreground: "#f3f4f6" },
    },
    {
      scope: ["keyword.operator", "punctuation"],
      settings: { foreground: "#8b919e" },
    },
  ],
};
