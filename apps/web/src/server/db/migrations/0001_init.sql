BEGIN;

CREATE TABLE IF NOT EXISTS operators (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_sub TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin', 'operator', 'reviewer')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (provider, provider_sub)
);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  target_url TEXT NOT NULL,
  categories_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  data_mode TEXT NOT NULL DEFAULT 'synthetic',
  budget_cents INTEGER NOT NULL,
  submitted_by TEXT NOT NULL,
  relaunched_from TEXT,
  artifact_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  run_id TEXT NOT NULL UNIQUE,
  artifact_path TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  summary_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
);

CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  seed_id TEXT,
  category TEXT NOT NULL,
  prompt_hash TEXT,
  request_artifact_path TEXT,
  response_artifact_path TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (run_id, case_id),
  FOREIGN KEY (run_id) REFERENCES runs(run_id),
  FOREIGN KEY (seed_id) REFERENCES seeds(id)
);

CREATE TABLE IF NOT EXISTS verdicts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  status TEXT NOT NULL,
  severity TEXT NOT NULL,
  rationale TEXT,
  judge_model TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (run_id, case_id),
  FOREIGN KEY (run_id) REFERENCES runs(run_id)
);

CREATE TABLE IF NOT EXISTS findings (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  case_id TEXT NOT NULL,
  title TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  first_seen_run_id TEXT,
  latest_run_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (category, case_id, status)
);

CREATE TABLE IF NOT EXISTS finding_attempts (
  finding_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (finding_id, attempt_id),
  FOREIGN KEY (finding_id) REFERENCES findings(id),
  FOREIGN KEY (attempt_id) REFERENCES attempts(id)
);

CREATE TABLE IF NOT EXISTS seeds (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  category_slug TEXT NOT NULL,
  title TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'med', 'low', 'info')),
  prompt_template TEXT NOT NULL,
  version INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  source_file TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS seed_versions (
  id TEXT PRIMARY KEY,
  seed_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  prompt_template TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'auto_approved',
  created_by TEXT NOT NULL DEFAULT 'seed_bootstrap',
  created_at TEXT NOT NULL,
  UNIQUE (seed_id, version),
  FOREIGN KEY (seed_id) REFERENCES seeds(id)
);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_by TEXT NOT NULL,
  reviewer_id TEXT,
  target_type TEXT NOT NULL,
  target_id TEXT,
  canonical_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  reviewer_comment TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  outcome TEXT NOT NULL,
  rule_ref TEXT,
  policy_snapshot_hash TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TRIGGER IF NOT EXISTS audit_events_no_update
BEFORE UPDATE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_events is append-only');
END;

CREATE TRIGGER IF NOT EXISTS audit_events_no_delete
BEFORE DELETE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_events is append-only');
END;

CREATE TABLE IF NOT EXISTS run_heartbeats (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  worker_id TEXT NOT NULL,
  node_name TEXT,
  heartbeat_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS campaign_jobs (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  job_type TEXT NOT NULL DEFAULT 'campaign_run',
  status TEXT NOT NULL DEFAULT 'queued',
  claim_token TEXT UNIQUE,
  claimed_at TEXT,
  submitted_by TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  finding_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  title TEXT NOT NULL,
  artifact_path TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (finding_id) REFERENCES findings(id)
);

CREATE TABLE IF NOT EXISTS policy_values (
  key TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  value_json TEXT NOT NULL,
  value_type TEXT NOT NULL,
  approval_path TEXT NOT NULL,
  system_reserved INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaign_jobs_status_claim ON campaign_jobs(status, claim_token);
CREATE INDEX IF NOT EXISTS idx_audit_events_occurred_at ON audit_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_seeds_category_slug ON seeds(category_slug);
CREATE INDEX IF NOT EXISTS idx_attempts_seed_id ON attempts(seed_id);
CREATE INDEX IF NOT EXISTS idx_findings_status ON findings(status);

COMMIT;
