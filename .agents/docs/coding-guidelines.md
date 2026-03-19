# Coding Guidelines

No headline comments. Don't use comments as section dividers (e.g., `// ---- Helpers ----`). If a file needs sections, it needs separate files.

No comments that explain what code does. If a comment restates the code below it, the code isn't clear enough. Rename, extract, or restructure instead. A comment like `// Check if the user is valid` above `if (isValidUser(u))` is noise. Comments should explain why, not what.

Exception: `// ARRANGE`, `// ACT`, `// ASSERT` comments in tests are allowed.

Avoid using `any`, `as unknown as`, or any unsafe casts. Use type inference and type guards instead.