---
layout: doc
---

# Introduction

Popular libraries such as [node-pg](https://node-postgres.com/), and [Sequelize](https://sequelize.org/) have proven themselves to be a great way to write SQL queries in JavaScript. However, they require you to separate the SQL query from the parameters, which can be a bit cumbersome and error-prone:

```js
// node-pg
client.query("SELECT * FROM users WHERE id = $1", [userId]);

// Sequelize (query and values)
sequelize.query({ query: "SELECT * FROM users WHERE id = $1", values: [userId] });

// Sequelize (replacements)
sequelize.query("SELECT * FROM users WHERE id = :userId", { replacements: { userId } });
```

`@ts-safeql/sql-tag` is a library that allows you to write SQL queries in a template string, and it will automatically escape the parameters for you:

```js
import { sql } from "@ts-safeql/sql-tag";

// node-pg
client.query(sql`SELECT * FROM users WHERE id = ${userId}`);
// => equivalent to client.query("SELECT * FROM users WHERE id = $1", [userId])

// Sequelize
sequelize.query(sql`SELECT * FROM users WHERE id = ${userId}`);
// => equivalent to sequelize.query({ query: "SELECT * FROM users WHERE id = $1", values: [userId] })
```
