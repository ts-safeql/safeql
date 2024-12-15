---
title: "SafeQL v4 Roadmap"
author:
  name: Eliya Cohen
date: 2024-12-15
sidebar: false
next: false
prev: false
comments: true
head:
  - - meta
    - property: og:type
      content: website
  - - meta
    - property: og:title
      content: SafeQL v4 Roadmap
  - - meta
    - property: og:image
      content: https://safeql.dev/safeql-v4-roadmap.jpg
  - - meta
    - property: og:url
      content: https://safeql.dev/blog/safeql-v4-roadmap
  - - meta
    - property: og:description
      content: Vite 6 Release Announcement
  - - meta
    - name: twitter:card
      content: summary_large_image
---

# SafeQL v4 Roadmap

_December 15, 2024_

![SafeQL v4 Roadmap](/safeql-v4-roadmap.jpg)

It's been a while since the last major version, and I'm excited to share the roadmap for SafeQL v4. This release will introduce several breaking changes, but I believe these changes are necessary to keep the library relevant and up to date.

The main goal of this version is to increase the modularity, flexibility, and pluggability of SafeQL. I want to make it easier and more feasible for library authors to deeply integrate with SafeQL. The initial 4.0.0 release won't include new features, but it will lay the foundation for features to come in future minor versions.

## Upgrade to ESLint v9

ESLint v8.x reached end-of-life on 2024-10-05 and is no longer maintained.

## Deprecate Glob Patterns in Favor of RegExp

When I initially released SafeQL, `connections.targets.[tag, wrapper]` could be configured using exact strings or glob patterns. While this worked, glob patterns are more suited for file paths than for text matching. Moving to RegExp provides a more precise and flexible approach for target matching.

## Migrating from ESLint Rule Options to `safeql.config.ts`

Today, you can configure SafeQL either by using a configuration file (`safeql.config.ts`) or by using ESLint’s rule options. In v4, I will deprecate ESLint-based configuration in favor of the configuration file. This change will allow for more complex configurations and will pave the way for new features.

### Why?

While it can be convenient to configure SafeQL using ESLint rule options, this approach is quite limited. The rule options must be fully serialized, meaning you can't pass values like functions or regex. This is a significant limitation preventing SafeQL from becoming more flexible and powerful.

### Example 1 - Better Transformations

Today, you can customize the generated output using the `transform` option:
```json
{
  "transform": ["{type}[]", ["before_colname", "after_colname"]]
}
```

While this solves most cases, it's not flexible enough for more complex transformations. It would be great if we could pass a function instead:
```ts
{
  // as text (`{ col: string }`)
  transform: ({ asText }) => `${asText()}[]`;
  // or as entries (`[["col", { kind: "type", value: "string" }], ...]`)
  transform: ({ asAST }) => MyTransformer.fromAST(asAST());
}
```

### Example 2 - Custom Migrations

Currently, you can't customize the migration strategy. You can only pass a path to a migrations directory containing raw SQL files (`.sql`). But what if we would be able to parse these SQL files and apply custom transformations before executing them?

```ts
export default defineConfig({
  migrations: {
    toSql: async (): Promise<string[]> => {
      // get all files from the migrations directory
      const files = await fs.readdir("migrations");

      // map each file to its SQL representation (if needed)
      return files.map((source) => Migrator.toSql(source));
    },
  },
});
```

### Example 3 - Custom Library Presets

By supporting functions in the configuration file, it will be possible for library authors to create custom presets. For example, a library author can create a preset for a specific library:
```ts
// acme-preset.ts

export function acmePreset(config: { /* ... */ }) {
  return createConnectionPreset({
    // ...
    onSuccess: (result) => { /* ... */ },
    onError: (error) => { /* ... */ },
    // onX: (x) => { /* ... */ },
  });
};
```

```ts
// safeql.config.ts

export default defineConfig({
  connections: [
    safeql.connections.acme({ /* ... */ }),
  ],
});
```

## Closing Thoughts

I'm excited about the upcoming changes in SafeQL v4. I believe they will make the library more flexible and powerful. I'm looking forward to hearing your feedback and suggestions. If you have any ideas or requests for new features, please let me know. I’m always open to new ideas and improvements.