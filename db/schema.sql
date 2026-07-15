-- Lifegate Baptist Church - D1 Schema

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'member',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sermons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  series TEXT,
  date TEXT NOT NULL,
  pastor TEXT,
  description TEXT,
  video_url TEXT,
  audio_url TEXT,
  pdf_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE NOT NULL,
  role TEXT DEFAULT 'member',
  family_unit TEXT,
  phone TEXT,
  address TEXT,
  birthday TEXT,
  ministries TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT,
  description TEXT,
  location TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Demo data
INSERT INTO users (email, name, password_hash, role) VALUES
  ('admin@lifegatebc.org', 'Admin User', 'admin123', 'admin'),
  ('james@lifegatebc.org', 'James Mitchell', 'password123', 'member'),
  ('robert@lifegatebc.org', 'Robert Hayes', 'password123', 'member'),
  ('patricia@lifegatebc.org', 'Patricia Summers', 'password123', 'member');

INSERT INTO sermons (title, series, date, pastor, description) VALUES
  ('The Good Shepherd', 'Gospel of John', '2025-06-22', 'Pastor Dave', 'John 10 - Understanding Christ as our shepherd'),
  ('Walking in the Light', 'Gospel of John', '2025-06-15', 'Pastor Dave', 'John 8 - Living in truth and freedom'),
  ('Bread of Life', 'Gospel of John', '2025-06-08', 'Pastor Dave', 'John 6 - Jesus as sustenance');

INSERT INTO members (user_id, role, family_unit, phone, address, birthday, ministries) VALUES
  (2, 'deacon', 'Mitchell Family', '(269) 555-0101', '123 Oak Street, Eau Claire, MI', 'March 15', 'Worship Team, Visitation'),
  (3, 'elder', 'Hayes Family', '(269) 555-0102', '456 Maple Ave, Eau Claire, MI', 'July 4', 'Adult Sunday School'),
  (4, 'member', NULL, '(269) 555-0103', '789 Pine Road, Eau Claire, MI', 'October 22', 'Children''s Ministry, Nursery');

INSERT INTO events (title, date, time, location, description) VALUES
  ('Sunday School', '2025-07-20', '10:00 AM', 'Main Building', 'Weekly Sunday School for all ages'),
  ('Sunday Worship', '2025-07-20', '11:00 AM', 'Sanctuary', 'Main worship service'),
  ('Wednesday Prayer & Study', '2025-07-23', '6:30 PM', 'Fellowship Hall', 'Evening prayer meeting and Bible study');
