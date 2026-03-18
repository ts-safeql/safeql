---
layout: doc
---

# Plugin API

::: warning EXPERIMENTAL
The plugin API is experimental and may change in future releases.
:::

SafeQL plugins let you extend SafeQL's behavior by hooking into its lifecycle. Plugins are packages that export a factory function — the factory receives config and returns an object with a `name` and hooks.

Currently the only supported hook is `createConnection`, which provides a custom database connection strategy. More hooks will be added in future releases.

## Using Plugins

Install the plugin package alongside `@ts-safeql/eslint-plugin`, then add it to the `plugins` array in your connection config:

```js
import safeql from "@ts-safeql/eslint-plugin/config";
import myPlugin from "safeql-plugin-example";

export default [
  safeql.configs.connections({
    plugins: [
      myPlugin({
        /* plugin-specific options */
      }),
    ],
    targets: [{ tag: "sql" }],
  }),
];
```

Plugins can be used alongside `databaseUrl` or `migrationsDir`. When a connection method is already specified, only non-connection hooks from plugins apply. A plugin's `createConnection` hook is only used when no other connection method is configured.

When multiple plugins provide the same hook, the last one in the array wins.

## Authoring a Plugin

Use `definePlugin` from `@ts-safeql/plugin-utils` and default-export the result:

```ts
import { definePlugin } from "@ts-safeql/plugin-utils";
import postgres from "postgres";

type MyConfig = {
  connectionString: string;
};

export default definePlugin<MyConfig>({
  name: "my-db",
  package: "safeql-plugin-my-db",
  setup(config) {
    return {
      createConnection: {
        cacheKey: `my-db://${config.connectionString}`,
        async handler() {
          return postgres(config.connectionString);
        },
      },
    };
  },
});
```

The default export is callable — users call it in their eslint config, and SafeQL's worker uses its `.factory` property at runtime to reconstruct the live plugin.

### Options

| Option    | Description                                                                                         |
| --------- | --------------------------------------------------------------------------------------------------- |
| `name`    | Short name (e.g., `"my-db"`). Automatically prefixed with `safeql-plugin-`. Used in error messages. |
| `package` | The npm package name. Used to resolve the plugin at runtime.                                        |
| `setup`   | Receives user config, returns hooks.                                                                |

### Hooks

Currently the only supported hook is `createConnection`:

```ts
createConnection?: {
  cacheKey: string;
  handler(): Promise<Sql>;
};
```

- **`cacheKey`** — stable string for connection deduplication. Same key = reuse existing connection.
- **`handler`** — async function that returns a [postgres](https://github.com/porsager/postgres) `Sql` instance.

More hooks will be added in future releases.

### Why Descriptors?

SafeQL runs query checking in a [worker thread](https://nodejs.org/api/worker_threads.html). Data crossing the worker boundary must be serializable — functions cannot be transferred. When a user calls the plugin in their config, it produces a plain `{ package, config }` descriptor. The worker then dynamically imports the package and uses `.factory` to reconstruct the live plugin.

## Conventions

- Plugin packages should be named `safeql-plugin-<name>` or scoped under your org.
- Include `safeql-plugin` in your `package.json` `keywords` field.
- Default-export the `definePlugin()` result.

## Official Plugins

- [`@ts-safeql/plugin-auth-aws`](/plugins/auth-aws) — AWS RDS IAM authentication
