---
layout: doc
---

# Configuration

## Prerequisites

Make sure you've added `@ts-safeql/eslint-plugin` to your ESLint plugins:

```json{3}
// .eslintrc.json
{
  "plugins": [..., "@ts-safeql/eslint-plugin"],
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

## Example 2: Migrations

To avoid having to keep your database up to date with your schema manually, configure the [`connections.migrationsDir` option](https://safeql.dev/api/index.html#connections-migrationsdir) to automatically synchronize the changes in your `.sql` migrations files to a "shadow database", which will also be used to get the type information from your queries.

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
            "operators": ["rawQuery"]
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

## Example 3: Multiple databases with a different connection URLs

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
            "migrationsDir": "./migrations_db1",
            "databaseName": "db1_shadow",
            "name": "db1",
            "operators": ["rawQuery"],
            // Read more about this below
            "connectionUrl": "postgres://pguser1:password1@localhost:5432/postgres"
          },
          {
            "migrationsDir": "./migrations_db2",
            "databaseName": "db2_shadow",
            "name": "db2",
            "operators": ["rawQuery"],
            "connectionUrl": "postgres://pguser2:password2@localhost:5432/postgres"
          }
        ]
      }
    ]
  }
}
```

### What is `connectionUrl` and should I configure it?

::: info TL;DR
If you're using migrations and your PostgreSQL superuser credentials are different
than the default below, you will need to configure `connectionUrl`.
```
postgres://postgres:postgres@localhost:5432/postgres
```
:::

The `connectionUrl` **IS NOT** the database and credentials your app uses - it is instead the
default database and superuser credentials, which will be used to create the shadow database.

By default, the `connectionUrl` is set `postgres://postgres:postgres@localhost:5432/postgres`, but if you're using a different credentials, you'll need to change it to your needs.
