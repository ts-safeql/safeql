---
"@ts-safeql/eslint-plugin": major
---

After 7 months of development, I'm happy to announce the release of the first major version of SafeQL!

# Breaking changes!

Until now, the way to configure where SafeQL will look for the queries and how to transform them was in the connectio level. For instance:

```json
{
  "connection": {
    "databaseUrl": "postgres://postgres:postgres@localhost:5432/my_database",
    "tagName": "sql",
    "transform": "{type}[]",
    "fieldTransform": "camel"
  }
}
```

While that was a good start, it was not flexible enough. For instance, if you wanted to use the same connection for multiple tags, you would have to duplicate the connection configuration over and over again.

```json
{
  "connection": {
    // ...
    "name": "dataSource",
    "operators": ["query", "queryOne"]
  },
  "connection": {
    // ... the same connection as before
    "name": "conn",
    "operators": ["query", "queryOne"]
  }
}
```

To tackle this, a new property called `targets` will now hold all of the targets that should be checked. This way, you can have multiple targets for the same connection, with the ability to transform them differently.

```json
{
  "connection": {
    // ...
    "targets": [
      {
        "tag": "sqlX",
        "transform": "{type}[]",
        "fieldTransform": "camel"
      },
      {
        // glob pattern is supported as well
        "wrapper": "dataSource.+(query|queryOne)",
        "transform": "{type}[]",
        "fieldTransform": "camel"
      }
    ]
  }
}
```

Migration guide:

If you were using `name` and `operators` to define a target, you can now use the `wrapper` property instead:

```diff
{
  "connection": {
    // ...
-   "name": "dataSource",
-   "operators": ["query", "queryOne"],
-   "transform": "{type}[]",
-   "fieldTransform": "camel"
+   "targets": [
+     {
+       "wrapper": "dataSource.+(query|queryOne)",
+       "transform": "{type}[]",
+       "fieldTransform": "camel"
+     }
+   ]
  }
}
```

If you were using `tagName` to define a target, you can now use the `tag` property instead:

```diff
{
  "connection": {
    // ...
-   "tagName": "sql",
-   "transform": "{type}[]",
-   "fieldTransform": "camel"
+   "targets": [
+     {
+       "tag": "sql",
+       "transform": "{type}[]",
+       "fieldTransform": "camel"
+     }
+   ]
  }
}
```
