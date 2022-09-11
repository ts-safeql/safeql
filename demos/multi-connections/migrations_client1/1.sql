CREATE TABLE comments (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  post_id integer REFERENCES posts(id),
  body text
);