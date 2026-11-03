CREATE TABLE certifications (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 1000),
  subteam TEXT CHECK (subteam IS NULL OR subteam IN ('mechanical', 'electrical', 'programming', 'cad', 'outreach', 'finance')),
  updated_at TEXT NOT NULL
);

CREATE INDEX certifications_subteam_name_idx ON certifications (subteam, name COLLATE NOCASE);
