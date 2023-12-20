-- Insert data into actor table
INSERT INTO actor(name, birthdate, bio, email) VALUES
('Johnny Depp', '1963-06-09', 'American actor, producer, and musician', 'j.depp@example.com'),
('Scarlett Johansson', '1984-11-22', 'American actress and singer', 's.johansson@example.com'),
('Leonardo DiCaprio', '1974-11-11', 'American actor, film producer and environmental activist', 'l.dicaprio@example.com'),
('Angelina Jolie', '1975-06-04', 'American actress, filmmaker, and humanitarian', 'a.jolie@example.com'),
('Tom Cruise', '1962-07-03', 'American actor and producer', 't.cruise@example.com');

-- Insert data into genre table
INSERT INTO genre(name, mood) VALUES
('Action', 'exciting'),
('Adventure', 'thrilling'),
('Horror', 'horror'),
('Romantic', 'happy'),
('Drama', 'sad');

-- Insert data into show table
INSERT INTO show(title, description, release_date, genre_id, is_active) VALUES
('The Earth Explorer', 'An adventurous journey around the globe', '2000-05-20', 2, TRUE),
('Nightmare Street', 'A road no one should tread', '1998-02-14', 3, FALSE),
('Love in Paris', 'A romantic tale set in the city of love', '2007-03-12', 4, TRUE),
('Hitorical Past', 'A thrilling dive into the history of mankind', '2010-11-25', 1, TRUE),
('Life Rollercoaster', 'A tale full of thrill, joy, and sadness', '2015-12-31', 5, FALSE);

-- Insert data into season table
INSERT INTO season(show_id, season_number, release_date, episode_count, run_time_hours, aired_from, aired_until, is_complete) VALUES
(1, 1, '2000-06-20', 10, 10, '2000-06-20 09:00:00', '2000-08-29 10:00:00', TRUE),
(2, 1, '1998-03-14', 8, 8, '1998-03-14 21:00:00', '1998-05-02 22:00:00', TRUE),
(3, 1, '2007-04-12', 12, 12, '2007-04-12 20:00:00', '2007-06-28 21:00:00', TRUE),
(4, 1, '2010-12-25', 20, 20, '2010-12-25 19:00:00', '2011-05-07 20:00:00', TRUE),
(5, 1, '2016-01-31', 15, 15, '2016-01-31 18:00:00', '2016-05-08 19:00:00', TRUE);

-- Insert data into episode table
INSERT INTO episode(title, description, season_id, episode_number, release_date, run_time_minutes) VALUES
('Earth - A beauty', 'Start of an incredible journey', 1, 1, '2000-06-20', 1),
('The haunted alley', 'Unveiling the horror street', 2, 1, '1998-03-14', 1),
('The Eiffel', 'Start of a beautiful journey', 3, 1, '2007-04-12', 1),
('The stone age', 'Beginning of mankind', 4, 1, '2010-12-25', 1),
('Childhood', 'Beginning of a thrilling ride', 5, 1, '2016-01-31', 1);

-- Insert data into show_actor table
INSERT INTO show_actor(show_id, actor_id) VALUES
(1, 1),
(1, 2),
(2, 3),
(2, 4),
(3, 5),
(4, 1),
(5, 2);