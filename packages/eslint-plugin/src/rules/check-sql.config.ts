import esbuild from "esbuild";
import fs from "fs";
import path from "path";
import z from "zod";
import { E, pipe } from "../utils/fp-ts";
import { Config, Options, RuleContext, UserConfigFile } from "./check-sql.rule";

type GetConfigFromFileError = {
  type: "ESBUILD_ERROR" | "NOT_FOUND" | "INVALID";
  message: string;
};

export function getConfigFromFileWithContext(params: { context: RuleContext; projectDir: string }) {
  if (!isConfigFileRuleOptions(params.context.options[0])) {
    return params.context.options[0];
  }

  return pipe(
    getConfigFromFile(params.projectDir),
    E.getOrElseW(({ type, message }) => {
      throw new Error(`safeql: ${type} ${message}`);
    })
  );
}

function getConfigFromFile(
  projectDir: string
): E.Either<GetConfigFromFileError, z.infer<typeof Config>> {
  return pipe(
    E.Do,
    E.bindW("configFilePath", () => E.right(path.join(projectDir, "safeql.config.ts"))),
    E.bindW("tempFileName", () => E.right(`safeql.config.temp-${Date.now()}.js`)),
    E.bindW("tempFilePath", ({ tempFileName }) => E.right(path.join(projectDir, tempFileName))),
    E.chainW((params) => {
      return fs.existsSync(params.configFilePath)
        ? E.right(params)
        : E.left({ type: "NOT_FOUND" as const, message: "safeql.config.ts not found" });
    }),
    E.chainFirstW(({ configFilePath, tempFilePath }) => {
      return E.tryCatch(
        () => {
          const result = esbuild.buildSync({
            entryPoints: [configFilePath],
            write: false,
            format: "cjs",
          });

          return fs.writeFileSync(tempFilePath, result.outputFiles[0].text);
        },
        (error) => ({ type: "ESBUILD_ERROR" as const, message: `${error}` })
      );
    }),
    E.bindW("rawConfig", ({ tempFilePath }) => {
      return E.tryCatch(
        () => {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          return require(tempFilePath).default;
        },
        (error) => ({
          type: "INVALID" as const,
          message: `${error}`,
        })
      );
    }),
    E.bindW("config", ({ rawConfig }) =>
      E.tryCatch(
        () => Config.parse(rawConfig),
        (error) => ({ type: "INVALID" as const, message: `${error}` })
      )
    ),
    E.chainFirstW(({ tempFilePath }) =>
      E.tryCatch(
        () => fs.unlinkSync(tempFilePath),
        (error) => ({ type: "INVALID" as const, message: `${error}` })
      )
    ),
    E.map(({ config }) => config)
  );
}

function isConfigFileRuleOptions(options: Options): options is UserConfigFile {
  return "useConfigFile" in options;
}
