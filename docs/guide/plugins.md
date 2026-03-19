---
layout: doc
---

# Plugin API

::: warning EXPERIMENTAL
The plugin API is experimental and may change in future releases.
:::

SafeQL plugins extend query checking by hooking into the analysis lifecycle. A plugin is a factory function that receives config and returns an object with a `name` and hooks.

## Conventions

- Name packages `safeql-plugin-<name>` or scope under your org (e.g., `@myorg/safeql-plugin-foo`).
- Include `safeql-plugin` in `package.json` keywords.
- Default-export the `definePlugin()` result.

## Using Plugins

Install the plugin alongside `@ts-safeql/eslint-plugin`, then add it to your connection config:

```js
import safeql from "@ts-safeql/eslint-plugin/config";
import myPlugin from "safeql-plugin-example";

export default [
  safeql.configs.connections({
    plugins: [
      myPlugin({
        /* options */
      }),
    ],
    targets: [{ tag: "sql" }],
  }),
];
```

## Authoring a Plugin

Use `definePlugin` from `@ts-safeql/plugin-utils`:

```ts
import { definePlugin } from "@ts-safeql/plugin-utils";

export default definePlugin({
  name: "my-plugin",
  package: "safeql-plugin-my-plugin",
  setup(config) {
    return {
      // hooks go here
    };
  },
});
```

### Simple Examples

**Custom connection:**

```ts
export default definePlugin<{ connectionString: string }>({
  name: "my-db",
  package: "safeql-plugin-my-db",
  setup(config) {
    return {
      createConnection: {
        cacheKey: config.connectionString,
        handler: () => postgres(config.connectionString),
      },
    };
  },
});
```

**Type overrides for a SQL library:**

```ts
export default definePlugin({
  name: "my-library",
  package: "safeql-plugin-my-library",
  setup() {
    return {
      connectionDefaults: {
        overrides: {
          types: { json: "JsonToken", date: "DateToken" },
        },
      },
    };
  },
});
```

### Options

| Option    | Description                                                 |
| --------- | ----------------------------------------------------------- |
| `name`    | Short identifier. Used in error messages.                   |
| `package` | npm package name. Used to resolve the plugin in the worker. |
| `setup`   | Factory function. Receives user config, returns hooks.      |

## Hooks

### `createConnection`

- **Type:** `{ cacheKey: string; handler(): Promise<Sql> }`

Provides a custom database connection.

- `cacheKey` — stable string for connection deduplication. Same key reuses the existing connection.
- `handler` — returns a [postgres](https://github.com/porsager/postgres) `Sql` instance.

When `databaseUrl` or `migrationsDir` is specified, `createConnection` is ignored. If multiple plugins provide this hook, the last one wins.

### `connectionDefaults`

- **Type:** `Record<string, unknown>`

Default values deep-merged into the connection config. User values take priority. When multiple plugins provide defaults, all are merged.

```ts
connectionDefaults: {
  overrides: {
    types: { json: "MyJsonType" },
  },
},
```

### `onTarget`

- **Type:** `(params: { node; context }) => TargetMatch | false | undefined`
- **Kind:** `sync`

Called for each `TaggedTemplateExpression`. Determines whether the tag is a SQL query.

**Return values:**

- `TargetMatch` — proceed with checking (optionally with custom behavior)
- `false` — skip this tag entirely
- `undefined` — defer to next plugin or SafeQL default

```ts
interface TargetMatch {
  skipTypeAnnotations?: boolean;
  typeCheck?: (ctx: TypeCheckContext) => TypeCheckReport | undefined;
}
```

**Example:** Skip `sql.fragment`, allow `sql.unsafe` without type checking:

```ts
onTarget({ node, context }) {
  const tag = node.tag;
  if (tag.type === "MemberExpression" && tag.property.name === "fragment") {
    return false;
  }
  if (tag.type === "MemberExpression" && tag.property.name === "unsafe") {
    return { skipTypeAnnotations: true };
  }
  return undefined;
}
```

### `onExpression`

- **Type:** `(params: { node; context }) => string | false | undefined`
- **Kind:** `sync`

Called for each interpolated expression inside a matched template.

**Return values:**

- `string` — inline SQL fragment (`$N` as placeholder, e.g., `"$N::jsonb"`)
- `false` — skip the entire query (too dynamic to analyze)
- `undefined` — use SafeQL default behavior

```ts
interface ExpressionContext {
  precedingSQL: string;
  checker: ts.TypeChecker;
  tsNode: ts.Node;
  tsType: ts.Type;
  tsTypeText: string;
}
```

**Example:** Handle library-specific helpers:

```ts
onExpression({ node, context }) {
  if (isCallTo(node, "json")) return "$N::jsonb";
  if (isCallTo(node, "identifier")) return buildIdentifier(node);
  if (isCallTo(node, "join")) return false; // too dynamic
  return undefined;
}
```

## Why Descriptors?

SafeQL runs in a [worker thread](https://nodejs.org/api/worker_threads.html). Data crossing the boundary must be serializable — functions cannot transfer. When users call the plugin, it produces a `{ package, config }` descriptor. The worker imports the package and calls `.factory` to reconstruct the live plugin.
