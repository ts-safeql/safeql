---
layout: doc
---

# API

All of the options that are mentioned below should be configured in your `eslintrc` config file
under the rule `"@ts-safeql/check-sql"`. Be sure to read the [Configuration](/guide/configuration.md) guide first.

[[toc]]

## `useConfigFile`

If set to `true`, SafeQL will look for a `safeql.config.ts` file in the root of your project.

```json
{
  "useConfigFile": true
}
```

```ts
// safeql.config.ts
import { defineConfig } from "@ts-safeql/eslint-plugin";

export default defineConfig({
  connections: {
    // ...
  },
});
```

::: info

This option **cannot** be used with [`connections`](#connections).

:::

## `connections`

Can be either an object that represents a single connection, or an array that represents multiple connections.

In most use cases, when you have only one database connection, you can pass a single object that
represents the type of the connection. For example:

```json
{
  "connections": {
    "databaseUrl": "postgres://user:pass@localhost:5432/dbname",
    "targets": [{ "tag": "sql" }]
  }
}
```

When working with multiple connections, you can pass an array of connections:

```json
{
  "connections": [
    {
      "databaseUrl": "postgres://user:pass@localhost:5432/dbname",
      "targets": [{ "tag": "sql" }]
    },
    {
      "databaseUrl": "postgres://user:pass@localhost:5432/dbname2",
      "targets": [{ "tag": "prisma.+($queryRaw|$executeRaw)" }]
    }
  ]
}
```

### `connections.databaseUrl`

The database URL that the plugin will use to infer the types of the queries, and report any errors.

::: info

- this option **cannot** be used with [`migrationsDir`](#connections-migrationsdir), [`connectionUrl`](#connections-connectionurl-optional), and [`databaseName`](#connections-databasename-optional)

:::

### `connections.migrationsDir`

The path to the directory where your [database migrations](https://www.prisma.io/dataguide/types/relational/what-are-database-migrations) are located (only `.sql` migration files supported currently). For example:

```json
{
  "connections": {
    "migrationsDir": "prisma/migrations"
    // ...
  }
}
```

::: info

- this option **can** be used with [`databaseName`](#connections-databasename-optional).
- this option **can** be used with [`watchMode`](#connections-watchmode-optional).
- this option **can** be used with [`connectionUrl`](#connections-connectionurl-optional).
- this option **cannot** be used with [`databaseUrl`](#connections-databaseurl).

:::

### `connections.watchMode` (Optional)

Whether or not to recreate the shadow database when a migration file is changed. This option is only
relevant when [`migrationsDir`](#connections-migrationsdir) is used.

If no value is provided, then it will default to `true`.

```json
{
  "connections": {
    "migrationsDir": "...",
    "watchMode": true
    // ...
  }
}
```

::: info

- this option **must** be used with [`migrationsDir`](#connections-migrationsdir).
- this option **can** be used with [`connectionUrl`](#connections-connectionurl-optional).
- this option **can** be used with [`databaseName`](#connections-databasename-optional).
- this option **cannot** be used with [`databaseUrl`](#connections-databaseurl).

:::

### `connections.connectionUrl` (Optional)

If no value is provided, it will fallback to:

```
postgres://postgres:postgres@localhost:5432/postgres
```

When using [migrations](#connections-migrationsdir), we don't have a database URL. In order to
connect to Postgres, we need to connect to an existing database. The default value is:

A connection URL is required to create a shadow database (and drop it after) to query the database
metadata so it can infer the types of the queries, and report any errors.

::: tip SHADOW DATABASE

Shadow database is a database that is being used to query the migrations folder metadata. It is created
and dropped automatically by SafeQL.

:::

::: info

- this option **must** be used with [`migrationsDir`](#connections-migrationsdir).
- this option **can** be used with [`watchMode`](#connections-watchmode-optional).
- this option **can** be used with [`databaseName`](#connections-databasename-optional).
- this option **cannot** be used with [`databaseUrl`](#connections-databaseurl).

:::

### `connections.databaseName` (Optional)

The name of the shadow database that will be created and dropped automatically by SafeQL.
If no value is provided, the default value is `safeql_${underscore_dir_name}_{dir_path_hash}`.
Read more in [`connectionUrl`](#connections-connectionurl-optional) option. For example:

```json
{
  "connections": {
    "migrationsDir": "...",
    "databaseName": "my_shadow_db"
    // ...
  }
}
```

::: info

- this option **must** be used with [`migrationsDir`](#connections-migrationsdir).
- this option **can** be used with [`watchMode`](#connections-watchmode-optional).
- this option **can** be used with [`connectionUrl`](#connections-connectionurl-optional).
- this option **cannot** be used with [`databaseUrl`](#connections-databaseurl).

:::

### `connections.targets.tag`

The `targets` tell SafeQL where to look for the queries. It's an array of `tag` and `wrapper` targets.

```json
{
  "connections": {
    // ...
    "targets": [
      { "tag": "sql1" } // [!code focus]
      { "tag": "sql2" } // [!code focus]
      { "wrapper": "conn.query" } // [!code focus]
      { "wrapper": "conn.+(query|execute)" } // [!code focus]
      { "wrapper": { "regex": "conn2.+(query|execute)" } } // [!code focus]
      ]
  }
}
```

### `connections.targets.tag`

The name of the tag (which could be a string, regex, or a glob pattern using [minimatch](https://github.com/isaacs/minimatch)) that SafeQL will use to analyze the queries. For example:

```json
{
  "connections": {
    // ...
    "targets": [{ "tag": "sql" }] // [!code focus]
    // or use a glob pattern: // [!code focus]
    // "targets": [{ "tag": "prisma.+($queryRaw|$executeRaw)" }] // [!code focus]
    // or use regex: // [!code focus]
    // "targets": [{ "tag": "prisma\.($queryRaw|$executeRaw)" }] // [!code focus]
  }
}
```

for:

```ts
const sql = postgres();

sql`SELECT id FROM users`;

// will be fixed to
sql<{ id: number }>`SELECT id FROM users`;
```

::: tip

If you're using [Postgres.js](https://github.com/porsager/postgres), then be sure to check out the
guide on [how to use SafeQL with Postgres.js](/compatibility/postgres.js).

:::

::: info

- this option **cannot** be used with [`wrapper`](#connections-targets-wrapper) as a sibling property.

:::

### `connections.targets.wrapper`

The wrapper function that receives the sql tag as an argument:

```json
{
  "connections": {
    // ...
    "targets": [{ "wrapper": "conn.query" }] // [!code focus]
  }
}
```

```ts
const conn = new Client();

conn.query(...);
```

::: info

- this option **cannot** be used with [`tag`](#connections-tagname) as a sibling property.

:::

### `connections.targets.transform` (Optional)

Transform the end result of the query. For example, if you want to transform the result of the query
to be an array of objects, you can use the following:

```json{7}
{
  "connections": {
    // ...
    "targets": [
      {
        // ...
        "transform": "{type}[]"
      }
    ]
  }
}
```

::: tip EXAMPLES

- `"{type}[]"` will transform the type to an array of the type.
- `["colname", "x_colname"]` will replace `colname` with `x_colname` in the type.
- `["{type}[]", ["colname", x_colname"]]` will do both

:::

### `connections.targets.fieldTransform` (Optional)

Transform the (column) field key. Can be one of the following:

- `"snake"` - `userId` → `user_id`
- `"camel"` - `user_id` → `userId`
- `"pascal"` - `user_id` → `UserId`
- `"screaming snake"` - `user_id` → `USER_ID`

```json{7}
{
  "connections": {
    // ...
    "targets": [
      {
        // ...
        "fieldTransform": "camel" // [!code focus]
      }
    ]
  }
}
```

### `connections.keepAlive` (Optional)

True by default. If set to false, the connection will be closed after the query is executed. This
is not recommended, and should only be used if you're sure that the connection should be closed.

### `connections.overrides.types` (Optional)

::: info

Please note that SafeQL won't actually parse the type, since SafeQL runs only in the tooling system (i.e, not in runtime).

:::

Override the default type mapping. For example, if you want to use [`LocalDate`](https://js-joda.github.io/js-joda/manual/LocalDate.html) instead of `Date` for the `date` type, you can use the following:

```json
{
  "connections": {
    "overrides": {
      "types": {
        "date": "LocalDate",
      }
    }
  }
}
```

Sometimes, the TypeScript type of the parameter (sql variable) is not the same as the type of the result. For example:

```ts
import postgres from "postgres";
import { sql } from "./sql";

function run(value: postgres.Parameter<LocalDate>)  {
  const result = sql<{ date: LocalDate }>`SELECT ${value}`;
  // ...
}
```

In this case, you can use the following syntax:

```json
{
  "connections": {
    "overrides": {
      "types": {
        "date": {
          // the type of the parameter (can be a regex or a glob pattern)
          "parameter": "Parameter<LocalDate>",
          // the generated type
          "return": "LocalDate"
        }
      }
    }
  }
}
```
