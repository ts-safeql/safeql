---
layout: doc
---

# Introduction

SafeQL is an [ESLint](https://eslint.org/) plugin that helps you write SQL (PostgreSQL) queries safely by:

1. Warn you when you've misspelled a query (could be a column, table, function, etc.)

<div class="error">

```typescript{2}
client.query(sql`SELECT idd FROM comments`);
                        ~~~ Error: column "idd" does not exist
```

</div>

2. Warn you about type errors (e.g., trying to compare a string to an integer)

<div class="error">

```typescript{3-4}
function getById(id: number) {
    client.query(sql`SELECT * FROM comments WHERE body = ${id}`);
                                                       ~
                        Error: operator does not exist: text = integer
}
```

</div>

3. Warn you about missing/incorrect query TS types (and suggest fixes).

<div class="error">

```typescript{2}
client.query(sql`SELECT id FROM comments`);
~~~~~~~~~~~~ Error: Query is missing type annotation
```

</div>

4. Warn you about incorrect query TS types (and suggest fixes).


<div class="error">

```typescript{2}
client.query<{ id: string }>(sql`SELECT id FROM comments`);
             ~~~~~~~~~~~~~~ Error: Query has incorrect type annotation
```

</div>

## Why SafeQL?

There are many well known popular SQL libraries out there, such as [Prisma](https://www.prisma.io/), [Sequelize](https://sequelize.org/), [pg](https://node-postgres.com/), [postgres](https://github.com/porsager/postgres). So why should I even consider SafeQL?

### It's a plugin, not an SQL library

SafeQL was never meant to replace your current SQL library. Instead, It's a plugin that you can use to add extra functionality to your existing SQL library. It means that you can use SafeQL with any SQL library that you want. You can even use SafeQL with multiple SQL libraries at the same time.

## Why should I write raw queries in the first place?

While using our favorite SQL library, sometimes it fails to provide the extra functionality that we need.
It can be due to a missing feature, performance issue, or a complex query that is hard to write using the library's API.
In these cases, the library will point you to write a raw query, and here's the point where SafeQL comes in.
