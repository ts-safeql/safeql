import esbuild from "esbuild";
import fs from "fs";
import path from "path";
import z from "zod";
import { E, pipe } from "../utils/fp-ts";
import { Config, Options, RuleContext, UserConfigFile } from "./check-sql.rule";

export function getConfigFromFileWithContext(params: {
  context: RuleContext;
  projectDir: string;
}): Config {
  if (!isConfigFileRuleOptions(params.context.options[0])) {
    return params.context.options[0];
  }

  return pipe(
    getConfigFromFile(params.projectDir),
    E.getOrElseW((message) => {
      throw new Error(`safeql: ${message}`);
    })
  );
}

function getConfigFromFile(projectDir: string): E.Either<string, Config> {
  const configFilePath = path.join(projectDir, "safeql.config.ts");
  const tempFileName = `safeql.config.temp-${Date.now()}.js`;
  const tempFilePath = path.join(projectDir, tempFileName);

  const removeIfExists = (filePath: string) => {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  };

  try {
    if (!fs.existsSync(configFilePath)) {
      throw new Error(`safeql.config.ts was not found at ${projectDir}`);
    }

    const result = esbuild.buildSync({
      entryPoints: [configFilePath],
      write: false,
      format: "cjs",
    });

    fs.writeFileSync(tempFilePath, result.outputFiles[0].text);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const rawConfig = require(tempFilePath).default;

    if (rawConfig === undefined) {
      throw new Error(`safeql.config.ts must export a default value`);
    }

    const config = Config.safeParse(rawConfig);

    if (!config.success) {
      throw new Error(`safeql.config.ts is invalid: ${config.error.message}`);
    }

    return E.right(config.data);
  } catch (error) {
    return E.left(`${error}`);
  } finally {
    removeIfExists(tempFilePath);
  }
}

function isConfigFileRuleOptions(options: Options): options is UserConfigFile {
  return "useConfigFile" in options;
}

export function defineConfig(config: z.infer<typeof Config>) {
  return config;
}
