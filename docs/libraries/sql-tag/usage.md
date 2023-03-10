---
layout: doc
---

# Usage

## node-pg

```js
import { Client } from "pg";
import { sql } from "@ts-safeql/sql-tag";

const client = new Client();

await client.connect();

const { rows } = await client.query(sql`SELECT * FROM users WHERE id = ${userId}`);
// => equivalent to client.query("SELECT * FROM users WHERE id = $1", [userId])

await client.end();
```

## Sequelize

```js
import { Sequelize } from "sequelize";
import { sql } from "@ts-safeql/sql-tag";

const sequelize = new Sequelize();

const users = await sequelize.query(sql`SELECT * FROM users WHERE id = ${userId}`);
// => equivalent to sequelize.query({ query: "SELECT * FROM users WHERE id = $1", values: [userId] })
```

---

## Advanced Usage

 - TODO write about createTypedSqlTag
 - TODO write about createTypedSqlTag.options.transform