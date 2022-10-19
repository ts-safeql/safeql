---
"@ts-safeql/generate": patch
"@ts-safeql/eslint-plugin": patch
---

fix a bug where columns were non-nullable while they should've been due to right/full join expressions

![column nullability by joins](https://user-images.githubusercontent.com/10504365/196818229-c6b43fa3-8a48-4891-800b-0151c35077d8.gif)
