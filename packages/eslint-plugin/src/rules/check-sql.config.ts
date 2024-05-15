import { createRequire } from "module";
import path from "path";
import { E, pipe } from "../utils/fp-ts";
import { RuleContext } from "./check-sql.rule";
import { Config, Options, UserConfigFile, zConfig } from "./RuleOptions";
import { InvalidConfigError } from "@ts-safeql/shared";

export function getConfigFromFileWithContext(params: {
  context: RuleContext;
  projectDir: string;
}): Config {
  const options = params.context.options[0];
  if (!isConfigFileRuleOptions(options)) {
    return options;
  }

  return pipe(
    getConfigFromFile(params.projectDir),
    E.getOrElseW((message) => {
      throw new Error(`safeql: ${message}`);
    }),
  );
}

function getConfigFromFile(projectDir: string): E.Either<string, Config> {
  try {
    const configFilePath = path.join(projectDir, "safeql.config.ts");
    const require = createRequire(import.meta.url);
    const rawConfig = require(`tsx/cjs/api`).require(configFilePath, configFilePath).default;

    if (rawConfig === undefined) {
      throw new InvalidConfigError(`safeql.config.ts must export a default value`);
    }

    const config = zConfig.safeParse(rawConfig);

    if (!config.success) {
      throw new InvalidConfigError(`safeql.config.ts is invalid: ${config.error.message}`);
    }

    return E.right(config.data);
  } catch (error) {
    return E.left(`${error}`);
  }
}

function isConfigFileRuleOptions(options: Options): options is UserConfigFile {
  return "useConfigFile" in options;
}

export function defineConfig(config: Config) {
  return config;
}
