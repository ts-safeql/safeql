CREATE DOMAIN D_EMAIL AS TEXT
CHECK (VALUE ~ '^[A-Za-z0-9._%-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,4}$');

CREATE TYPE MOOD AS ENUM (
    'happy',
    'sad',
    'exciting',
    'thrilling',
    'horror'
);

CREATE TABLE actor (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    birthdate DATE,
    bio TEXT,
    email D_EMAIL UNIQUE
);

CREATE TABLE genre (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    mood MOOD NOT NULL
);

CREATE TABLE show (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    release_date DATE NOT NULL,
    genre_id INT REFERENCES genre(id),
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE season (
    id SERIAL PRIMARY KEY,
    show_id INT REFERENCES show(id) ON DELETE CASCADE,
    season_number INTEGER NOT NULL,
    release_date DATE,
    episode_count INT,
    run_time_hours FLOAT,
    aired_from TIMESTAMP,
    aired_until TIMESTAMPTZ,
    is_complete BOOLEAN DEFAULT FALSE,
    UNIQUE (show_id, season_number)
);

CREATE TABLE episode (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    season_id INT REFERENCES season(id) ON DELETE CASCADE,
    episode_number INTEGER NOT NULL,
    release_date DATE,
    run_time_minutes FLOAT,
    UNIQUE (season_id, episode_number)
);

CREATE TABLE show_actor (
    show_id INT REFERENCES show(id),
    actor_id INT REFERENCES actor(id)
);