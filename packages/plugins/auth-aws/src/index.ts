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
    const profile = config.awsProfile ?? "default";

    return {
      createConnection: {
        cacheKey: `iam://${config.databaseUser}@${config.databaseHost}:${port}/${config.databaseName}?region=${config.awsRegion}&profile=${profile}`,

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

          return postgres({
            host: hostname,
            port: port,
            user: username,
            password: () => signer.getAuthToken(),
            database: config.databaseName,
            ssl: "require",
          });
        },
      },
    };
  },
});
