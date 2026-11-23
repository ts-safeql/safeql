import type { ESLint } from "eslint";
import { FlatConfig } from "@typescript-eslint/utils/ts-eslint";
import rules from "./rules";
import { version } from "../package.json";

const plugin = {
  rules: rules,
  meta: {
    name: "safeql",
    version: version,
  },
} satisfies FlatConfig.Plugin;

export default plugin as typeof plugin & ESLint.Plugin;
