CREATE TABLE device_sign_in_requests (
  id TEXT PRIMARY KEY NOT NULL,
  approval_token_hash TEXT NOT NULL UNIQUE,
  poll_token_hash TEXT NOT NULL UNIQUE,
  approved_uid TEXT,
  expires_at INTEGER NOT NULL,
  approved_at INTEGER,
  denied_at INTEGER,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_device_sign_in_expiry
  ON device_sign_in_requests(expires_at);

CREATE TABLE auth_rate_limits (
  key TEXT PRIMARY KEY NOT NULL,
  window_started_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);
