CREATE TABLE comments (
  id serial PRIMARY KEY,
  post_id integer REFERENCES posts(id),
  body text
);