CREATE VIEW visible_members AS
  SELECT id, name
  FROM actor;

CREATE VIEW actor_display_names AS
  SELECT id, COALESCE(bio, 'unknown') AS display_name
  FROM actor;

CREATE VIEW actor_bio AS
  SELECT bio
  FROM actor;

CREATE MATERIALIZED VIEW season_episode_counts AS
  SELECT episode.season_id, COALESCE(COUNT(*), 0)::int AS episode_count
  FROM episode
  GROUP BY episode.season_id;
