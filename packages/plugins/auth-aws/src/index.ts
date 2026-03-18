import { definePlugin } from "@ts-safeql/plugin-utils";
import { Signer } from "@aws-sdk/rds-signer";
import { fromIni, fromNodeProviderChain } from "@aws-sdk/credential-providers";
import postgres from "postgres";

export type AwsIamPluginConfig = {
  databaseHost: string;
  databasePort?: number;
  databaseUser: string;
  databaseName: string;
  awsRegion: string;
  awsProfile?: string;
};

export default definePlugin<AwsIamPluginConfig>({
  name: "aws-iam",
  package: "@ts-safeql/plugin-auth-aws",
  setup(config) {
    const port = config.databasePort ?? 5432;

    return {
      createConnection: {
        cacheKey: `iam://${config.databaseUser}@${config.databaseHost}:${port}/${config.databaseName}`,

        async handler() {
          const {
            databaseHost: hostname,
            databaseUser: username,
            awsRegion: region,
            awsProfile: profile,
          } = config;

          const credentials = profile
            ? fromIni({ profile })
            : fromNodeProviderChain({ clientConfig: { region } });

          const signer = new Signer({ hostname, port, username, region, credentials });
          const token = await signer.getAuthToken();

          return postgres({
            host: hostname,
            port: port,
            user: username,
            password: token,
            database: config.databaseName,
            ssl: "require",
          });
        },
      },
    };
  },
});
