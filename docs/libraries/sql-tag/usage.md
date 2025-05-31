---
layout: doc
---

# Usage

## node-pg

Using `sql` tag with the `pg` module provides a safe way to construct your queries, ensuring that values are properly parameterized to prevent SQL injection attacks.

```ts
import { Client } from "pg";
import { sql } from "@ts-safeql/sql-tag";

const client = new Client();

await client.connect();

const userId = 1;
const { rows } = await client.query(sql`SELECT * FROM users WHERE id = ${userId}`);
// => equivalent to client.query("SELECT * FROM users WHERE id = $1", [userId])

await client.end();
```

## Sequelize

Similarly, the `sql` tag can be utilized with Sequelize to ensure that queries are constructed safely and values are properly escaped.

```ts
import { Sequelize } from "sequelize";
import { sql } from "@ts-safeql/sql-tag";

const sequelize = new Sequelize();

const userId = 1;
const users = await sequelize.query(sql`SELECT * FROM users WHERE id = ${userId}`);
// => equivalent to sequelize.query({ query: "SELECT * FROM users WHERE id = $1", values: [userId] })
```

## TypeORM

::: tip DEMO
Check out [@ts-safeql-demos/typeorm](https://github.com/ts-safeql/safeql/tree/main/demos/typeorm) for a working example.
:::

---

# Advanced Usage

## `createTypedSqlTag`

For cases where you want to enforce a specific type for the values in your SQL queries, you can use `createTypedSqlTag`. This function allows you to create a custom `sql` tag that is aware of the type of values it should accept.

```ts
import { createTypedSqlTag } from "@ts-safeql/sql-tag";

// Define the possible expressions that can be used in the query
type Expression = string | number | boolean;

// Create a typed SQL tag
const sql = createTypedSqlTag<UserFields>();

// Now `sql` will only accept `Expression` expressions
const query = sql`SELECT * FROM users WHERE id = ${userId} AND name = ${userName}`;
```

## Transforming Values

Sometimes, you might need to transform the values before they are passed to the query. The `createTypedSqlTag` function accepts an `options` object which can include a `transform` function. This function is applied to each value before constructing the final query.

```ts
import { createTypedSqlTag } from "@ts-safeql/sql-tag";

// Create a typed SQL tag with the transform option
const booleanSql = createTypedSqlTag<boolean>({
  // Define a transform function that converts a boolean to an integer
  transform: (value) => {
    return typeof value === "boolean" ? (value ? 1 : 0) : value;
  },
});

// Booleans will be transformed to integers in the query
const query = booleanSql`UPDATE settings SET enabled = ${true}`;
// => equivalent to "UPDATE settings SET enabled = $1", with the value [1] after transformation
```

With these advanced features, you can create more robust and type-safe SQL queries that automatically handle value transformations according to your application's needs.

# Why?

Back in the days, before ES6, we were used to manually parameterize our queries (separating variables from the queries) in order to avoid SQL injection attacks.

While SQL injections are still a thing, and your queries should still be parameterized, it doesn't mean **you** should be the one doing it.

When ES6 came out, [Tagged Templates](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals#tagged_templates) were introduced, giving us a way to return a custom value from a template string.

As a result, we could take a mix of strings and expressions and return an object or any other value based on that mix. In our case, we can use this feature to parameterize our queries automatically:

```sql
sql`SELECT * FROM users WHERE id = ${userId}`
/**
 * Run-time equivalent:
 * {
 *   query: "SELECT * FROM users WHERE id = $1",
 *   values: [userId]
 * }
 */
```

At the time of writing this, libraries like `pg` and `sequelize` don't provide a built-in way to parameterize queries using tagged templates. This is where the `sql` tag comes in.
