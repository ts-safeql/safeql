---
layout: doc
---

# Configuration

## Prerequisites

Make sure you've added `@ts-safeql/eslint-plugin` to your ESLint plugins:

```json{2}
// .eslintrc.json
{
  "plugins": [..., "@ts-safeql/eslint-plugin"],
  ...
}
```

## 1. A basic example of a single database

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

## 2. A basic example of migrations folder

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
Every time ESLint initializes the query (When VSCode boots up, or when your run ESLint from the cli), the shadow database is dropped and recreated.
:::

## 2. Advanced example of multiple databases with a different connection url

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
            "connectionUrl": "postgres://pguser:password@localhost:5432/postgres"
          },
          {
            "migrationsDir": "./migrations_db2",
            "databaseName": "db2_shadow",
            "name": "db2",
            "operators": ["rawQuery"],
            "connectionUrl": "postgres://pguser:password@localhost:5432/postgres"
          }
        ]
      }
    ]
  }
}
```

### What is "connectionUrl" and should I supply it?

::: info TL;DR
If your'e using migrations and your postgres database URL is different than
```
postgres://postgres:postgres@localhost:5432/postgres
```
then you must supply an appropriate `connectionUrl`.
:::


The `connectionUrl` **IS NOT** the database URL we want to connect to. It's a URL to a database that
exists on the server. The reason for that, is because we can't connect to postgres without specifying a database.
So we need to specify a database that exists on the server, and once we're connected, we can create a shadow database.

By default, the `connectionUrl` is set `postgres://postgres:postgres@localhost:5432/postgres`, but if you're using a different credentials, you'll need to change it to your needs.
