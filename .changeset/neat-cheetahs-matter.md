---
"@ts-safeql/eslint-plugin": minor
"@ts-safeql/generate": minor
"@ts-safeql/sql-tag": minor
"@ts-safeql/docs": minor
---

This release introduces a lot of (internal) changes, but to be honest, I'm too lazy to write them all down so I'll mention the highlights:

### SafeQL supports Flat Config! 🎉

You can now use SafeQL with the new ESLint [Flat Config](https://eslint.org/docs/latest/use/configure/configuration-files#configuration-file) API:

```js
// eslint.config.js

import safeql from "@ts-safeql/eslint-plugin/config";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // ...
  safeql.configs.connections({
    // ...
  }),
);
```

### SafeQL is now built for both ESM and CJS

Up until now, I built SafeQL using only TSC (targeting CJS). In order to support both ESM and CJS, I had to use a different build system. I chose to use [unbuild](https://github.com/unjs/unbuild) because it's awesome.
