ALTER TABLE notification_preferences ADD COLUMN email_enabled INTEGER NOT NULL DEFAULT 0 CHECK (email_enabled IN (0, 1));
ALTER TABLE notification_preferences ADD COLUMN last_email_digest_at TEXT;

