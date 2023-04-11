CREATE TABLE users (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name text
);

CREATE TABLE posts (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id integer REFERENCES users(id),
  title text,
  body text,
  published_at timestamp
);

CREATE TABLE test_date_columns (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  date_local timestamp,
  date_utc timestamptz,
  just_date date
);