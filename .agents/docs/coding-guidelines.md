# Coding Guidelines

No headline comments. Don't use comments as section dividers (e.g., `// ---- Helpers ----`). If a file needs sections, it needs separate files.

No comments that explain what code does. If a comment restates the code below it, the code isn't clear enough. Rename, extract, or restructure instead. A comment like `// Check if the user is valid` above `if (isValidUser(u))` is noise. Comments should explain why, not what.

Comments must be timeless. Write for a reader seeing the code fresh, not for a reviewer of the current diff. Don't justify the code relative to a change or its previous state — phrases like "now rule-agnostic", "intentionally X (both A and B share…)", "simplified to…", "no longer needs…", "moved from…". Once committed, that context is gone and the comment only confuses. If the rationale still matters independent of the change, state it as a standing fact; otherwise delete it.

Exception: `// ARRANGE`, `// ACT`, `// ASSERT` comments in tests are allowed.

Avoid using `any`, `as unknown as`, or any unsafe casts. Use type inference and type guards instead.