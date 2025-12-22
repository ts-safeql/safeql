---
"@ts-safeql/eslint-plugin": patch
---

Add `typesVersions` to `package.json` to support projects using legacy `moduleResolution` settings (like `node` / `node10`) that do not support the `exports` field for subpath resolution.

