CREATE TABLE users (
  uid TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('coach', 'student_leader', 'student')),
  subteam TEXT CHECK (subteam IS NULL OR subteam IN ('mechanical', 'electrical', 'programming', 'cad', 'outreach', 'finance')),
  certification_ids TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  must_reset_password INTEGER NOT NULL DEFAULT 0 CHECK (must_reset_password IN (0, 1))
);
CREATE INDEX users_role_subteam_idx ON users (role, subteam);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  subteam TEXT NOT NULL,
  status TEXT NOT NULL,
  leaders_only INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  sort_order REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX tasks_board_idx ON tasks (archived, subteam, status, sort_order);
CREATE INDEX tasks_updated_idx ON tasks (updated_at DESC);
