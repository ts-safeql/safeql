import { FlatConfig } from "@typescript-eslint/utils/ts-eslint";
import { RuleOptionConnection } from "./rules/RuleOptions";
import safeqlPlugin from "./plugin";

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

type ConnectionInput = DistributiveOmit<RuleOptionConnection, "targets"> & {
  targets?: RuleOptionConnection["targets"];
};

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
    } satisfies FlatConfig.Config,

    /**
     * If you prefer configuring safeql via a flat config, use this config.
     */
    connections: (connections: ConnectionInput | ConnectionInput[]): FlatConfig.Config => ({
      plugins: {
        "@ts-safeql": safeqlPlugin,
      },
      rules: {
        "@ts-safeql/check-sql": ["error", { connections }],
      },
    }),
  },
};
