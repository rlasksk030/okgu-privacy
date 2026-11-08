-- Durable, bounded, retryable notification work. Old delivery evidence remains.
CREATE TABLE IF NOT EXISTS push_jobs (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('scheduled','test')),
 target_date TEXT,
 slot INTEGER,
 slot_time TEXT,
 due_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending',
 attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at INTEGER NOT NULL,
 lease_owner TEXT,
 lease_until INTEGER NOT NULL DEFAULT 0,
 last_error TEXT,
 finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS push_jobs_ready ON push_jobs(status,next_attempt_at);
CREATE INDEX IF NOT EXISTS push_jobs_device ON push_jobs(subscription_id,due_at);
CREATE INDEX IF NOT EXISTS push_jobs_expiry ON push_jobs(expires_at);
-- Preserve already requested tests when upgrading the earlier implementation.
INSERT OR IGNORE INTO push_jobs(id,user_id,subscription_id,kind,due_at,expires_at,next_attempt_at)
 SELECT 'legacy-test:'||j.id,j.user_id,j.subscription_id,'test',j.due_at,j.due_at+3600000,j.due_at
 FROM test_jobs j JOIN subscriptions s ON s.id=j.subscription_id AND s.user_id=j.user_id;
