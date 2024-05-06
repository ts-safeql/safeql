import { FlatConfig } from "@typescript-eslint/utils/ts-eslint";
import { Config } from "./rules/RuleOptions";
import safeqlPlugin from "./plugin";

export default {
  configs: {
    /**
     * If you prefer configuring safeql via a config file (safeql.config.ts), use this config.
     */
    useConfigFile: {
      plugins: {
        "@ts-safeql": safeqlPlugin,
      },
      rules: {
        "@ts-safeql/check-sql": ["error", { useConfigFile: true }],
      },
      languageOptions: {
        parserOptions: { project: true },
      },
    } satisfies FlatConfig.Config,

    /**
     * If you prefer configuring safeql via a flat config, use this config.
     */
    connections: (connections: Config["connections"]): FlatConfig.Config => ({
      plugins: {
        "@ts-safeql": safeqlPlugin,
      },
      rules: {
        "@ts-safeql/check-sql": ["error", { connections }],
      },
      languageOptions: {
        parserOptions: { project: true },
      },
    }),
  },
};
