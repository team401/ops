CREATE TABLE IF NOT EXISTS team401_auth_sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  member_id TEXT NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_team401_auth_sessions_token ON team401_auth_sessions (token_hash, expires_at);
CREATE INDEX IF NOT EXISTS idx_team401_auth_sessions_member ON team401_auth_sessions (member_id, expires_at);

CREATE TABLE IF NOT EXISTS team401_device_sign_in_requests (
  id TEXT PRIMARY KEY,
  approval_token_hash TEXT NOT NULL,
  poll_token_hash TEXT NOT NULL,
  requester_ip TEXT NOT NULL DEFAULT '',
  approved_member_id TEXT,
  approved_email TEXT,
  approved_display_name TEXT,
  approved_at INTEGER,
  denied_at INTEGER,
  consumed_at INTEGER,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_team401_device_expiry ON team401_device_sign_in_requests (expires_at);
CREATE INDEX IF NOT EXISTS idx_team401_device_rate_limit ON team401_device_sign_in_requests (requester_ip, created_at);
