---
layout: doc
---

# API

All of the options that are mentioned below should be configured in your `eslintrc` config file
under the rule `"@ts-safeql/check-sql"`. Be sure to read the [Configuration](/guide/configuration.md) guide first.

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
    "tagName": "sql"
  }
}
```

When working with multiple connections, you can pass an array of connections:

```json
{
  "connections": [
    {
      "databaseUrl": "postgres://user:pass@localhost:5432/dbname",
      "tagName": "sql"
    },
    {
      "databaseUrl": "postgres://user:pass@localhost:5432/dbname2",
      "name": "Prisma",
      "operators": ["$queryRaw", "$executeRaw"]
    }
  ]
}
```

### `connections.databaseUrl`

The database URL that the plugin will use to infer the types of the queries, and report any errors.

::: info

- this option **cannot** be used with [`migrationsDir`](#connections-migrationsdir), [`connectionUrl`](#connections-connectionurl), and [`databaseName`](#connections-databasename)

:::

### `connections.migrationsDir`

The path to the directory where your [database migrations](https://www.prisma.io/dataguide/types/relational/what-are-database-migrations) are located (only `.sql` migration files supported currently). For example:

```json
{
  "connections": {
    "migrationsDir": "prisma/migrations",
    "databaseName": "..."
    // ...
  }
}
```

::: info

- this option **must** be used with [`databaseName`](#connections-databasename).
- this option **can** be used with [`connectionUrl`](#connections-connectionurl).
- this option **cannot** be used with [`databaseUrl`](#connections-databaseurl).

:::

### `connections.connectionUrl`

When using [migrations](#connections-migrationsdir), we don't have a database URL. In order to
connect to Postgres, we need to connect to an existing database. The default value is:

```
postgres://postgres:postgres@localhost:5432/postgres
```

A connection URL is required to create a shadow database (and drop it after) to query the database
metadata so it can infer the types of the queries, and report any errors.

::: tip SHADOW DATABASE

Shadow database is a database that is being used to query the migrations folder metadata. It is created
and dropped automatically by SafeQL.

:::

::: info

- this option **must** be used with [`migrationsDir`](#connections-migrationsdir), and [`databaseName`](#connections-databasename).
- this option **cannot** be used with [`databaseUrl`](#connections-databaseurl).

:::

### `connections.databaseName`

The name of the shadow database that will be created and dropped automatically by SafeQL. Read more in [`connectionUrl`](#connections-connectionurl) option. For example:

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
- this option **can** be used with [`connectionUrl`](#connections-connectionurl).
- this option **cannot** be used with [`databaseUrl`](#connections-databaseurl).

:::

### `connections.tagName`

The name of the tag that SafeQL will use to analyze the queries. For example, `"tagName": "sql"` for:

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

- this option **cannot** be used with [`name`](#connections-name) and [`operators`](#connections-operators).

:::

### `connections.name`

The name of the variable the holds the connection. For example, `"name": "conn"` for:

```ts
const conn = new Client();

conn.query(...);
```

::: info

- this option **cannot** be used with [`tagName`](#connections-tagname).
- this option **must** be used with [`operators`](#connections-operators).

:::

### `connections.operators`

The names of the operators that SafeQL will use to analyze the queries. For example, `"operators": ["$queryRaw", "$executeRaw"]` for:

```ts
const conn = new Client();

conn.$queryRaw(...); // will be fixed to conn.$queryRaw<{ ... }>(...);
conn.$executeRaw(...); // will be fixed to conn.$executeRaw<{ ... }>(...);
```

::: info

- this option **cannot** be used with [`tagName`](#connections-tagname).
- this option **must** be used with [`name`](#connections-name).

:::

### `connections.transform`

Transform the end result of the query. For example, if you want to transform the result of the query
to be an array of objects, you can use the following:

```json
{
  "connections": {
    // ...
    "transform": "${type}[]"
  }
}
```

::: tip EXAMPLES

- `"${type}[]"` will transform the type to an array of the type.
- `["Nullable", "Maybe"]` will replace `Nullable` with `Maybe` in the type.
- `["${type}[]", ["Nullable", "Maybe"]]` will do both

:::

### `connections.keepAlive`

True by default. If set to false, the connection will be closed after the query is executed. This
is not recommended, and should only be used if you're sure that the connection should be closed.

### `connections.overrides.types`

Override the default type mapping. For example, if you want to use [`LocalDate`](https://js-joda.github.io/js-joda/manual/LocalDate.html) instead of `Date`:

```json
{
  "connections": {
    "overrides": {
      "types": {
        "date": "LocalDate"
      }
    }
  }
}
```

::: info

Please note that SafeQL won't actually parse the type, since SafeQL runs only in the tooling system (i.e, not in runtime).

:::
