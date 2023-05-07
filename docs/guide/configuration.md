---
layout: doc
---

# Configuration

## Prerequisites

Make sure you've added `@ts-safeql/eslint-plugin` to your ESLint plugins and set [`parserOptions.project`](https://typescript-eslint.io/docs/linting/typed-linting).

```json{3,5}
// .eslintrc.json
{
  "plugins": [..., "@ts-safeql/eslint-plugin"],
  "parserOptions": {
    "project": "./tsconfig.json"
  }
  ...
}
```

## Example 1: Single database connected to your app

Connect using the same database and credentials your app uses

::: tip DEMO
Check out [@ts-safeql-demos/basic](https://github.com/ts-safeql/safeql/tree/main/demos/basic) for a working example.
:::

```json
// .eslintrc.json
{
  // ...
  "rules": {
    // ...
    "@ts-safeql/check-sql": [
      "error",
      {
        "connections": {
          // The URL of the database:
          "databaseUrl": "postgres://postgres:postgres@localhost:5432/my_database",
          "targets": [
            // Check all of the queries that are used with the `sql` tag:
            { "tag": "sql" }
          ]
        }
      }
    ]
  }
}
```

And now SafeQL will be able to lint your queries like so:

<div class="error">

```typescript{2}
const query = sql`SELECT * FROM users`
              ~~~ Error: Query is missing type annotation (auto-fix)
```

</div>

After auto-fix

<div class="success">

```typescript{2}
const query = sql<{ id: number; name: string; }>`SELECT * FROM users`
              ^^^ ✅ Query is valid and type-safe!
```

</div>

## Example 2: Multiple databases connected to your apps

Connect using multiple databases and credentials used by multiple apps

::: tip DEMO
Check out [@ts-safeql-demos/multi-connections](https://github.com/ts-safeql/safeql/tree/main/demos/multi-connections) for a working example.
:::

```json
// .eslintrc.json
{
  // ...
  "rules": {
    // ...
    "@ts-safeql/check-sql": [
      "error",
      {
        "connections": [
          {
            // The URL of the database:
            "databaseUrl": "postgres://postgres:postgres@localhost:5432/my_database_1",
            "targets": [
              // Check all of the queries that matches db1.sql`...`
              { "tag": "db1.sql" }
            ]
          },
          {
            // The URL of the database:
            "databaseUrl": "postgres://postgres:postgres@localhost:5432/my_database_2",
            "targets": [
              // Check all of the queries that matches db1.sql`...`
              { "tag": "db2.sql" }
            ]
          }
        ]
      }
    ]
  }
}
```

## Example 3: Migrations

If your project contains `.sql` migration files, configuring [`connections.migrationsDir` option](/api/index.html#connections-migrationsdir) instead of `databaseUrl` will automatically synchronize the changes in your migrations to a separate "shadow database", which will also be used to retrieve type information related to your queries.

This is beneficial in cases where it is impossible or inconvenient to manually keep your database in sync with your migrations.

::: tip DEMO
Check out [@ts-safeql-demos/basic-migrations-raw](https://github.com/ts-safeql/safeql/tree/main/demos/basic-migrations-raw) for a working example.
:::

```json
// .eslintrc.json
{
  // ...
  "rules": {
    // ...
    "@ts-safeql/check-sql": [
      "error",
      {
        "connections": [
          {
            // The migrations path:
            "migrationsDir": "./migrations",
            "targets": [
              // Check all of the queries that matches db.sql`...`
              { "tag": "db.sql" }
            ]
            // To connect using alternate superuser credentials, see below
            // "connectionUrl": "postgres://pguser:password@localhost:5432/postgres"
          }
        ]
      }
    ]
  }
}
```

::: info Why do we need a shadow database?
The shadow database is used to run the migrations on it, and then compare the raw queries against it.
The shadow database is dropped and recreated every time ESLint initializes the query (When VS Code boots up, or when you run ESLint from the terminal).
:::

### What is `connectionUrl` and should I configure it?

::: info TL;DR
If you're using migrations and your PostgreSQL superuser credentials are different
than the default below, you will need to configure `connectionUrl`.

```
postgres://postgres:postgres@localhost:5432/postgres
```

:::

The `connectionUrl` **IS NOT** the database and credentials your app uses - it is instead the
default database and superuser credentials which are used to create the shadow database.

If you don't want to provide superuser credentials, you can also provide a role which has the
permissions to run `createdb` and `dropdb`.

By default, the `connectionUrl` is set `postgres://postgres:postgres@localhost:5432/postgres`, but if you're using a different credentials, you'll need to change it to your needs.

## Example 4: Multiple migration configurations

::: tip DEMO
Check out [@ts-safeql-demos/multi-connections](https://github.com/ts-safeql/safeql/tree/main/demos/multi-connections) for a working example.
:::

```json
// .eslintrc.json
{
  // ...
  "rules": {
    // ...
    "@ts-safeql/check-sql": [
      "error",
      {
        "connections": [
          {
            "migrationsDir": "./db1/migrations",
            "targets": [
              // Check all of the queries that matches db1.sql`...`
              { "tag": "db1.sql" }
            ]
          },
          {
            "migrationsDir": "./db2/migrations",
            "targets": [
              // Check all of the queries that matches db2.sql`...`
              { "tag": "db2.sql" }
            ]
          }
        ]
      }
    ]
  }
}
```

## Example 5: Mixing `databaseUrl` and `migrationsDir` configurations

```json
// .eslintrc.json
{
  // ...
  "rules": {
    // ...
    "@ts-safeql/check-sql": [
      "error",
      {
        "connections": [
          {
            // The URL of the database:
            "databaseUrl": "postgres://postgres:postgres@localhost:5432/my_database",
            "targets": [
              // Check all of the queries that matches db1.sql`...`
              { "tag": "db1.sql" }
            ]
          },
          {
            "migrationsDir": "./packages/a/migrations",
            "targets": [
              // Check all of the queries that matches db2.sql`...`
              { "tag": "db2.sql" }
            ]
          },
          {
            "migrationsDir": "./packages/b/migrations",
            "targets": [
              // Check all of the queries that matches db3.sql`...`
              { "tag": "db3.sql" }
            ]
          }
        ]
      }
    ]
  }
}
```

## Example 6: Using glob pattern

SafeQL uses [minimatch](https://github.com/isaacs/minimatch) to match the glob pattern.

```json

```json{16}
// .eslintrc.json
{
  // ...
  "rules": {
    // ...
    "@ts-safeql/check-sql": [
      "error",
      {
        "connections": [
          {
            // The URL of the database:
            "databaseUrl": "postgres://postgres:postgres@localhost:5432/my_database",
            "targets": [
              // The sql tags that should be checked. // [!code focus]
              // either `db.$queryRaw` or `db.$executeRaw` // [!code focus]
              { "tag": "db.+($queryRaw|$executeRaw)" } // [!code focus]
            ]
          },
        ]
      }
    ]
  }
}
```

## Example 7: Using regex

SafeQL can also use regex to match the sql tags.

```json

```json{16}
// .eslintrc.json
{
  // ...
  "rules": {
    // ...
    "@ts-safeql/check-sql": [
      "error",
      {
        "connections": [
          {
            // The URL of the database:
            "databaseUrl": "postgres://postgres:postgres@localhost:5432/my_database",
            "targets": [
              // The sql tags that should be checked. // [!code focus]
              // either `db.$queryRaw` or `db.$executeRaw` // [!code focus]
              { "tag": { "regex": "db\\.($queryRaw|$executeRaw)" } } // [!code focus]
            ]
          },
        ]
      }
    ]
  }
}
```

## Example 8: Using a wrapper function

Sometimes we want to wrap our queries with a function and set the type annotations in the wrapper instead. for example:

```typescript{4:5-5}
import { db, sql } from "./db";

function getName() {
  return db.queryOne<{name: string }>(
    sql`SELECT name FROM users WHERE id = ${1}`
  );
}
```

> Note that the Typescript type is on the function (wrapper) rather than on the tag.

```json{16}
// .eslintrc.json
{
  // ...
  "connections": [
    {
      // ...
      "targets": [
        // Check all of the queries that matches db.queryOne(*`...`) // [!code focus]
        { "wrapper": "db.queryOne" } // [!code focus]
      ]
    },
  ]
}
```
