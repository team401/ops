CREATE TABLE calendar_events (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL CHECK (category IN ('outreach', 'competition', 'deadline', 'meeting', 'other')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  created_by_uid TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX calendar_events_dates_idx ON calendar_events (start_date, end_date);

CREATE TABLE timeclock_pins (
  uid TEXT PRIMARY KEY NOT NULL,
  pin TEXT NOT NULL UNIQUE,
  updated_at TEXT NOT NULL
);

CREATE TABLE time_entries (
  id TEXT PRIMARY KEY NOT NULL,
  uid TEXT NOT NULL,
  activity TEXT NOT NULL CHECK (activity IN ('shop', 'outreach')),
  activity_name TEXT NOT NULL,
  clock_in TEXT NOT NULL,
  clock_out TEXT,
  clocked_in_by_uid TEXT NOT NULL,
  clocked_out_by_uid TEXT
);
CREATE INDEX time_entries_uid_clock_in_idx ON time_entries (uid, clock_in DESC);
CREATE INDEX time_entries_open_idx ON time_entries (clock_out, uid);

CREATE TABLE device_sessions (
  uid TEXT NOT NULL,
  id TEXT NOT NULL,
  label TEXT NOT NULL,
  user_agent TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0 CHECK (revoked IN (0, 1)),
  PRIMARY KEY (uid, id)
);
CREATE INDEX device_sessions_uid_seen_idx ON device_sessions (uid, last_seen_at DESC);
