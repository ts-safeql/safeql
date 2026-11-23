---
layout: doc
---

# Running in CI

SafeQL connects to PostgreSQL while ESLint runs, so CI needs a database that contains your schema. Start a disposable database before the lint step and point SafeQL at it.

## GitHub Actions

The workflow below starts a PostgreSQL service container, creates the schema, and then lints the project:

```yaml
# .github/workflows/lint.yml
name: Lint

on:
  push:
  pull_request:

jobs:
  lint:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: postgres
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgres://postgres:postgres@localhost:5432/postgres
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - name: Create the schema
        run: psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f schema.sql
      - run: npx eslint .
```

Replace `schema.sql` and `npx eslint .` with the commands your project already uses. The important part is that the database is migrated before ESLint runs.

Your ESLint configuration can read the URL from the environment:

```js
// eslint.config.js
safeql.configs.connections({
  databaseUrl: process.env.DATABASE_URL,
  targets: [{ tag: "sql" }],
});
```

::: tip
Keep the password in a CI secret if the database is not disposable, and never commit production credentials.
:::

## Using migrations instead of a live database

If your project uses [`migrationsDir`](/api/index.html#connections-migrationsdir), SafeQL creates a shadow database from the migrations. In that case point `connectionUrl` at the CI PostgreSQL server instead of `databaseUrl`:

```js
safeql.configs.connections({
  migrationsDir: "./migrations",
  connectionUrl: process.env.DATABASE_URL,
  targets: [{ tag: "sql" }],
});
```

The database user must be allowed to create databases, because the shadow database is created next to the connection URL. The `postgres` superuser used in the workflow above already has that permission, and `DATABASE_URL` points at that disposable server.

## Other CI providers

Any provider that can run PostgreSQL or reach a disposable database works the same way: set the connection URL in the environment, apply the schema (or use `migrationsDir`), then run ESLint. Docker Compose, GitLab services, and managed preview databases follow the same steps.
