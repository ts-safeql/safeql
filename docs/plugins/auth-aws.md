---
layout: doc
---

# @ts-safeql/plugin-auth-aws

Connect to AWS RDS databases using [IAM authentication](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.IAMDBAuth.html). Generates a short-lived IAM token and connects with SSL.

## Installation

```bash
pnpm add @ts-safeql/plugin-auth-aws
```

## Usage

```js
import safeql from "@ts-safeql/eslint-plugin/config";
import awsIamAuth from "@ts-safeql/plugin-auth-aws";

export default [
  safeql.configs.connections({
    plugins: [
      awsIamAuth({
        databaseHost: "<instance>.<id>.<region>.rds.amazonaws.com",
        databasePort: 5432,
        databaseUser: "iam_user",
        databaseName: "mydb",
        awsRegion: "eu-west-1",
        awsProfile: "my-profile",
      }),
    ],
    targets: [{ tag: "sql" }],
  }),
];
```

## Options

| Option         | Type     | Required | Description                                                                           |
| -------------- | -------- | -------- | ------------------------------------------------------------------------------------- |
| `databaseHost` | `string` | Yes      | RDS hostname                                                                          |
| `databasePort` | `number` | No       | Database port (default: `5432`)                                                       |
| `databaseUser` | `string` | Yes      | Database user configured for IAM auth                                                 |
| `databaseName` | `string` | Yes      | Database name                                                                         |
| `awsRegion`    | `string` | Yes      | AWS region (e.g., `"eu-west-1"`)                                                      |
| `awsProfile`   | `string` | No       | AWS profile from `~/.aws/credentials`. If omitted, uses the default credential chain. |

## Prerequisites

- Your RDS instance must have [IAM database authentication enabled](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.IAMDBAuth.Enabling.html).
- The database user must be [granted the `rds_iam` role](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.IAMDBAuth.DBAccounts.html).
- Valid AWS credentials must be available (via profile, environment variables, or IMDS).

::: tip
If using SSO, run `aws sso login --profile <your-profile>` before linting.
:::
