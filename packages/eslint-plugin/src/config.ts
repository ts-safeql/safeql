import type { Linter } from "eslint";
import { RuleOptionConnection } from "./rules/RuleOptions";
import safeqlPlugin from "./plugin";

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

type ConnectionInput = DistributiveOmit<RuleOptionConnection, "targets"> & {
  targets?: RuleOptionConnection["targets"];
};

type SafeQLConfigs = {
  configs: {
    useConfigFile: Linter.Config;
    connections: (connections: ConnectionInput | ConnectionInput[]) => Linter.Config;
  };
};

const config: SafeQLConfigs = {
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
    },

    /**
     * If you prefer configuring safeql via a flat config, use this config.
     */
    connections: (connections) => ({
      plugins: {
        "@ts-safeql": safeqlPlugin,
      },
      rules: {
        "@ts-safeql/check-sql": ["error", { connections }],
      },
    }),
  },
};

export default config;
