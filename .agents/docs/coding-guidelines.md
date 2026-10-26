# Coding Guidelines

No comments. Code explains what it does; tests explain why it exists.

If a comment explains what code does, the code isn't clear enough. Rename, extract a well-named helper, or restructure instead. A comment like `// Check if the user is valid` above `if (isValidUser(u))` is noise.

If a comment explains why code exists, write a test that fails without that code. The test name carries the rationale.

If a file needs section dividers (e.g., `// ---- Helpers ----`), it needs to be split into separate files.

Exceptions:

- `// ARRANGE`, `// ACT`, `// ASSERT` in tests.
- Lint and compiler directives (`eslint-disable`, `@ts-expect-error`, …).
- JSDoc on public API (exported options, config, and plugin types users interact with). Keep it timeless: describe the API as it is, never relative to a change or its previous state ("now…", "no longer…", "simplified to…").

Avoid using `any`, `as unknown as`, or any unsafe casts. Use type inference and type guards instead.
