const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
const db = new Database('movies.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS movies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    genre TEXT NOT NULL,
    year INTEGER,
    rating TEXT,
    status TEXT DEFAULT 'Want to Watch',
    review TEXT,
    poster TEXT,
    director TEXT,
    cast TEXT,
    watched_date TEXT
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS topten (
    rank INTEGER PRIMARY KEY,
    movie_id INTEGER,
    FOREIGN KEY (movie_id) REFERENCES movies(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS friends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS friend_movies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    friend_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    genre TEXT,
    year INTEGER,
    poster TEXT,
    status TEXT DEFAULT 'Recommended',
    FOREIGN KEY (friend_id) REFERENCES friends(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year INTEGER NOT NULL,
    target INTEGER NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS movie_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    movie_id INTEGER NOT NULL,
    note TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (movie_id) REFERENCES movies(id)
  )
`);

try { db.exec('ALTER TABLE movies ADD COLUMN director TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE movies ADD COLUMN cast TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE movies ADD COLUMN watched_date TEXT'); } catch(e) {}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Movies
app.get('/api/movies', (req, res) => {
  const movies = db.prepare('SELECT * FROM movies ORDER BY id DESC').all();
  res.json(movies);
});

app.get('/api/movies/:id', (req, res) => {
  const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(req.params.id);
  if (!movie) return res.status(404).json({ error: 'Movie not found' });
  res.json(movie);
});

app.post('/api/movies', (req, res) => {
  const { title, genre, year, rating, status, review, poster, director, cast, watched_date } = req.body;
  const result = db.prepare('INSERT INTO movies (title, genre, year, rating, status, review, poster, director, cast, watched_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(title, genre, year, rating, status || 'Want to Watch', review || '', poster || '', director || '', cast || '', watched_date || '');
  res.json({ id: result.lastInsertRowid, ...req.body });
});

app.put('/api/movies/:id', (req, res) => {
  const { title, genre, year, rating, status, review, poster, director, cast, watched_date } = req.body;
  db.prepare('UPDATE movies SET title=?, genre=?, year=?, rating=?, status=?, review=?, poster=?, director=?, cast=?, watched_date=? WHERE id=?').run(title, genre, year, rating, status, review, poster, director || '', cast || '', watched_date || '', req.params.id);
  res.json({ success: true });
});

app.delete('/api/movies/:id', (req, res) => {
  db.prepare('DELETE FROM movies WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/stats', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as count FROM movies').get();
  const watched = db.prepare("SELECT COUNT(*) as count FROM movies WHERE status = 'Watched'").get();
  const watching = db.prepare("SELECT COUNT(*) as count FROM movies WHERE status = 'Watching'").get();
  const want = db.prepare("SELECT COUNT(*) as count FROM movies WHERE status = 'Want to Watch'").get();
  const byGenre = db.prepare('SELECT genre, COUNT(*) as count FROM movies GROUP BY genre').all();
  res.json({ total: total.count, watched: watched.count, watching: watching.count, want: want.count, byGenre });
});

app.get('/api/people', (req, res) => {
  const movies = db.prepare('SELECT id, title, poster, year, rating, director, cast FROM movies').all();
  const directors = {};
  const actors = {};
  movies.forEach(m => {
    if (m.director) {
      if (!directors[m.director]) directors[m.director] = [];
      directors[m.director].push(m);
    }
    if (m.cast) {
      m.cast.split(',').map(a => a.trim()).filter(Boolean).forEach(actor => {
        if (!actors[actor]) actors[actor] = [];
        actors[actor].push(m);
      });
    }
  });
  res.json({ directors, actors });
});

// Top Ten
app.get('/api/topten', (req, res) => {
  const rows = db.prepare('SELECT * FROM topten ORDER BY rank ASC').all();
  res.json(rows);
});

app.post('/api/topten', (req, res) => {
  const { movieId, rank } = req.body;
  const existing = db.prepare('SELECT * FROM topten WHERE rank = ?').get(rank);
  if (existing) {
    db.prepare('UPDATE topten SET movie_id = ? WHERE rank = ?').run(movieId, rank);
  } else {
    db.prepare('INSERT INTO topten (movie_id, rank) VALUES (?, ?)').run(movieId, rank);
  }
  res.json({ success: true });
});

app.delete('/api/topten/:rank', (req, res) => {
  db.prepare('DELETE FROM topten WHERE rank = ?').run(req.params.rank);
  res.json({ success: true });
});

// Friends
app.get('/api/friends', (req, res) => {
  const friends = db.prepare('SELECT * FROM friends').all();
  const result = friends.map(f => ({
    ...f,
    movies: db.prepare('SELECT * FROM friend_movies WHERE friend_id = ?').all(f.id)
  }));
  res.json(result);
});

app.post('/api/friends', (req, res) => {
  const { name } = req.body;
  const result = db.prepare('INSERT INTO friends (name) VALUES (?)').run(name);
  res.json({ id: result.lastInsertRowid, name, movies: [] });
});

app.delete('/api/friends/:id', (req, res) => {
  db.prepare('DELETE FROM friend_movies WHERE friend_id = ?').run(req.params.id);
  db.prepare('DELETE FROM friends WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.post('/api/friends/:id/movies', (req, res) => {
  const { title, genre, year, poster, status } = req.body;
  const result = db.prepare('INSERT INTO friend_movies (friend_id, title, genre, year, poster, status) VALUES (?, ?, ?, ?, ?, ?)').run(req.params.id, title, genre || '', year || null, poster || '', status || 'Recommended');
  res.json({ id: result.lastInsertRowid, ...req.body });
});

app.delete('/api/friends/movies/:id', (req, res) => {
  db.prepare('DELETE FROM friend_movies WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/friends/:id/compare', (req, res) => {
  const myMovieTitles = db.prepare('SELECT title FROM movies').all().map(m => m.title.toLowerCase());
  const friendMovies = db.prepare('SELECT * FROM friend_movies WHERE friend_id = ?').all(req.params.id);
  const common = friendMovies.filter(m => myMovieTitles.includes(m.title.toLowerCase()));
  const onlyFriend = friendMovies.filter(m => !myMovieTitles.includes(m.title.toLowerCase()));
  res.json({ common, onlyFriend });
});

// Goals
app.get('/api/goals', (req, res) => {
  const goals = db.prepare('SELECT * FROM goals ORDER BY year DESC').all();
  const currentYear = new Date().getFullYear();
  const result = goals.map(g => {
    const watched = db.prepare("SELECT COUNT(*) as count FROM movies WHERE status = 'Watched' AND watched_date LIKE ?").get(`${g.year}%`);
    return { ...g, watched: watched.count };
  });
  res.json(result);
});

app.post('/api/goals', (req, res) => {
  const { year, target } = req.body;
  const existing = db.prepare('SELECT * FROM goals WHERE year = ?').get(year);
  if (existing) {
    db.prepare('UPDATE goals SET target = ? WHERE year = ?').run(target, year);
    res.json({ id: existing.id, year, target });
  } else {
    const result = db.prepare('INSERT INTO goals (year, target) VALUES (?, ?)').run(year, target);
    res.json({ id: result.lastInsertRowid, year, target });
  }
});

app.delete('/api/goals/:id', (req, res) => {
  db.prepare('DELETE FROM goals WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Movie Notes
app.get('/api/movies/:id/notes', (req, res) => {
  const notes = db.prepare('SELECT * FROM movie_notes WHERE movie_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json(notes);
});

app.post('/api/movies/:id/notes', (req, res) => {
  const { note, timestamp } = req.body;
  const result = db.prepare('INSERT INTO movie_notes (movie_id, note, timestamp) VALUES (?, ?, ?)').run(req.params.id, note, timestamp || '');
  res.json({ id: result.lastInsertRowid, movie_id: req.params.id, note, timestamp });
});

app.delete('/api/notes/:id', (req, res) => {
  db.prepare('DELETE FROM movie_notes WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Timeline
app.get('/api/timeline', (req, res) => {
  const movies = db.prepare("SELECT * FROM movies WHERE status = 'Watched' AND watched_date != '' ORDER BY watched_date DESC").all();
  res.json(movies);
});

app.listen(3000, () => {
  console.log('Server running at http://localhost:3000');
});