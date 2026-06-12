export const DEFAULT_SCHEMA = `CREATE TYPE role AS ENUM ('owner', 'admin', 'member');

CREATE TABLE "user" (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  email text NOT NULL UNIQUE,
  display_name text,
  role role NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE post (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  author_id integer NOT NULL REFERENCES "user" (id),
  title text NOT NULL,
  body text,
  published_at timestamptz
);`;

export const DEFAULT_CODE = `const feed = await sql\`
  select
    post.title,
    post.published_at,
    author.display_name,
    author.role
  from post
    join "user" author on author.id = post.author_id
  order by post.published_at desc nulls last
\`;`;

export const DEFAULT_CONFIG = `{
  "targets": [{ "tag": "sql" }],
  "fieldTransform": null,
  "nullAsOptional": false,
  "nullAsUndefined": false,
  "overrides": { "types": {} },
  "skipTypeAnnotations": false
}`;
