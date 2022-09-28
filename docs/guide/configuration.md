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
        "connections": [
          {
            // The URL of the database:
            "databaseUrl": "postgres://postgres:postgres@localhost:5432/my_database",
            // The name of the variable that holds the connection:
            "name": "myDb",
            // An array of operators that wraps the raw query:
            "operators": ["rawQuery"]
          }
        ]
      }
    ]
  }
}
```

And now you'll be able to write queries like this:

```typescript
const query = myDb.rawQuery(sql`SELECT * FROM users`);
```

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
            // The name of the variable that holds the connection:
            "name": "myDb1",
            // An array of operators that wraps the raw query:
            "operators": ["rawQuery"]
          },
          {
            // The URL of the database:
            "databaseUrl": "postgres://postgres:postgres@localhost:5432/my_database_2",
            // The name of the variable that holds the connection:
            "name": "myDb2",
            // An array of operators that wraps the raw query:
            "operators": ["query"]
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
            // A shadow database name (see explanation below):
            "databaseName": "my_db_shadow",
            // The name of the variable that holds the connection:
            "name": "myDb",
            // An array of operators that wraps the raw query:
            "operators": ["rawQuery"],
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
            "databaseName": "db1_shadow",
            "name": "db1",
            "operators": ["rawQuery"]
          },
          {
            "migrationsDir": "./db2/migrations",
            "databaseName": "db2_shadow",
            "name": "db2",
            "operators": ["rawQuery"]
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
            // The name of the variable that holds the connection:
            "name": "myDb",
            // An array of operators that wraps the raw query:
            "operators": ["rawQuery"]
          },
          {
            "migrationsDir": "./packages/a/migrations",
            "databaseName": "db1_shadow",
            "name": "db1",
            "operators": ["rawQuery"]
          },
          {
            "migrationsDir": "./packages/b/migrations",
            "databaseName": "db2_shadow",
            "name": "db2",
            "operators": ["rawQuery"]
          }
        ]
      }
    ]
  }
}
```
