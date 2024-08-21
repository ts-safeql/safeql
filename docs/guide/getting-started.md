---
layout: doc
---

# Getting Started

## Prerequisites

Make sure you have [ESLint](https://eslint.org/) installed in your project and that it's [configured](https://typescript-eslint.io/docs/#quickstart) to work with TypeScript.

<details>
  <summary>For Windows see here</summary>
  <br>

  1. Python should be installed
  2. Visual C++ build tools workload for Visual Studio 2022

  You can use **Chocolatey** Package Manager ([See Installation/Setup](https://docs.chocolatey.org/en-us/choco/setup/))
  ```
  choco install python visualstudio2022-workload-vctools -y
  ```
</details>

## Installation

::: tabs npm
== npm

```bash
npm install --save-dev @ts-safeql/eslint-plugin libpg-query
```

== pnpm

```bash
pnpm install --save-dev @ts-safeql/eslint-plugin libpg-query
```

== yarn

```bash
yarn add --dev @ts-safeql/eslint-plugin libpg-query
```

:::

## Integrate with ESLint

In order for SafeQL to be able to lint your queries, you need to specify either a [`databaseUrl`](/api/#connections-databaseurl) or a [`migrationsDir`](/api/#connections-migrationsdir) in your ESLint configuration:

:::tabs eslintrc
== Flat Config

```js
// eslint.config.js

import safeql from "@ts-safeql/eslint-plugin/config";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // ...
  safeql.configs.connections({
    // read more about configuration in the next section
    databaseUrl: "postgres://postgres:postgres@localhost:5432/my_database",
    targets: [{ tag: "sql" }],
  })
);
```

== Legacy Config
1. Add `@ts-safeql/eslint-plugin` to your plugins and set [`parserOptions.project`](https://typescript-eslint.io/docs/linting/typed-linting):

```json
// .eslintrc.json

{
  "plugins": [..., "@ts-safeql/eslint-plugin"], // [!code highlight]
  "parserOptions": {
    "project": "./tsconfig.json"  // [!code highlight]
  }
  // ...
}
```

2. Add `@ts-safeql/check-sql` to your rules and set the `connections` option:

```js
// .eslintrc.json

{
  // ...
  "rules": {
    "@ts-safeql/check-sql": ["error", {
        "connections": {
            // ... read more about configuration in the next section
            "databaseUrl": "postgres://postgres:postgres@localhost:5432/my_database",
            "targets": [{ "tag": "sql" }],
        }
    }]
  }
}
```

:::

In the next section, you'll learn how to [configure your connection(s)](/guide/configuration).
