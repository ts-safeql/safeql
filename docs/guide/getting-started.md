---
layout: doc
---

# Getting Started

## Prerequisites

Set up ESLint following [the `typescript-eslint` Getting Started docs](https://typescript-eslint.io/getting-started), to enable TypeScript language support in ESLint.

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
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
  },
  safeql.configs.connections({
    // read more about configuration in the next section
    databaseUrl: "postgres://postgres:postgres@localhost:5432/my_database",
    targets: [{ tag: "sql" }],
  })
);
```

== Legacy Config
1. Add `@ts-safeql/eslint-plugin` to your plugins and set [`parserOptions.project`](https://typescript-eslint.io/docs/linting/typed-linting) (or `parserOptions.projectService` for typescript-eslint v8+):

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
