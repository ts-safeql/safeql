CREATE TABLE users (
  id serial PRIMARY KEY,
  name text
);

CREATE TABLE posts (
  id serial PRIMARY KEY,
  user_id integer REFERENCES users(id),
  title text,
  body text,
  published_at timestamp
);
