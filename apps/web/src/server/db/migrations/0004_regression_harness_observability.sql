BEGIN;

CREATE TABLE IF NOT EXISTS target_versions (
  id TEXT PRIMARY KEY,
  version_key TEXT NOT NULL UNIQUE,
  label TEXT,
  source TEXT NOT NULL DEFAULT 'unknown',
  comparable INTEGER NOT NULL DEFAULT 1 CHECK (comparable IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS regression_cases (
  id TEXT PRIMARY KEY,
  finding_id TEXT,
  approval_id TEXT,
  source_seed_id TEXT,
  source_case_id TEXT,
  category TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'med', 'low', 'info')),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (finding_id) REFERENCES findings(id),
  FOREIGN KEY (approval_id) REFERENCES approvals(id),
  FOREIGN KEY (source_seed_id) REFERENCES seeds(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_regression_cases_active_finding
ON regression_cases(finding_id)
WHERE finding_id IS NOT NULL AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_regression_cases_category_status
ON regression_cases(category, status);

CREATE TABLE IF NOT EXISTS regression_case_versions (
  id TEXT PRIMARY KEY,
  regression_case_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  target_version_id TEXT NOT NULL,
  protected_behavior TEXT NOT NULL,
  required_evidence_json TEXT NOT NULL,
  invalid_conditions_json TEXT NOT NULL,
  deterministic_checks_json TEXT NOT NULL,
  judge_rubric_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (regression_case_id, version),
  FOREIGN KEY (regression_case_id) REFERENCES regression_cases(id),
  FOREIGN KEY (target_version_id) REFERENCES target_versions(id)
);

CREATE INDEX IF NOT EXISTS idx_regression_case_versions_target
ON regression_case_versions(target_version_id);

CREATE TABLE IF NOT EXISTS regression_suites (
  id TEXT PRIMARY KEY,
  target_version_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  triggered_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (target_version_id) REFERENCES target_versions(id)
);

CREATE INDEX IF NOT EXISTS idx_regression_suites_target_status
ON regression_suites(target_version_id, status);

CREATE TABLE IF NOT EXISTS regression_suite_cases (
  suite_id TEXT NOT NULL,
  regression_case_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (suite_id, regression_case_id),
  FOREIGN KEY (suite_id) REFERENCES regression_suites(id),
  FOREIGN KEY (regression_case_id) REFERENCES regression_cases(id)
);

CREATE TABLE IF NOT EXISTS regression_suite_results (
  id TEXT PRIMARY KEY,
  suite_id TEXT NOT NULL,
  regression_case_id TEXT NOT NULL,
  target_version_id TEXT NOT NULL,
  run_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('pass', 'fail', 'partial', 'invalid')),
  category TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  invalid_reason TEXT,
  is_reappearance INTEGER NOT NULL DEFAULT 0 CHECK (is_reappearance IN (0, 1)),
  is_cross_category_regression INTEGER NOT NULL DEFAULT 0 CHECK (is_cross_category_regression IN (0, 1)),
  created_at TEXT NOT NULL,
  UNIQUE (suite_id, regression_case_id),
  FOREIGN KEY (suite_id) REFERENCES regression_suites(id),
  FOREIGN KEY (regression_case_id) REFERENCES regression_cases(id),
  FOREIGN KEY (target_version_id) REFERENCES target_versions(id)
);

CREATE INDEX IF NOT EXISTS idx_regression_suite_results_status
ON regression_suite_results(status, category, target_version_id);

CREATE TABLE IF NOT EXISTS vulnerability_lifecycle_events (
  id TEXT PRIMARY KEY,
  finding_id TEXT NOT NULL,
  regression_case_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'fixed_pending_verification', 'resolved', 'reopened', 'deferred')),
  evidence_run_id TEXT,
  regression_suite_result_id TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (finding_id) REFERENCES findings(id),
  FOREIGN KEY (regression_case_id) REFERENCES regression_cases(id),
  FOREIGN KEY (regression_suite_result_id) REFERENCES regression_suite_results(id)
);

CREATE INDEX IF NOT EXISTS idx_vulnerability_lifecycle_latest
ON vulnerability_lifecycle_events(finding_id, created_at DESC);

CREATE TABLE IF NOT EXISTS run_costs (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  suite_id TEXT,
  regression_case_id TEXT,
  agent_role TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  category TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  request_count INTEGER,
  cost_micros INTEGER,
  currency TEXT NOT NULL DEFAULT 'USD',
  provenance TEXT NOT NULL CHECK (provenance IN ('provider_reported', 'estimated', 'unavailable')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (suite_id) REFERENCES regression_suites(id),
  FOREIGN KEY (regression_case_id) REFERENCES regression_cases(id)
);

CREATE INDEX IF NOT EXISTS idx_run_costs_run_suite
ON run_costs(run_id, suite_id, agent_role);

CREATE TABLE IF NOT EXISTS agent_timeline_events (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  suite_id TEXT,
  regression_case_id TEXT,
  sequence INTEGER NOT NULL,
  agent_role TEXT NOT NULL,
  action TEXT NOT NULL,
  input_ref TEXT,
  output_ref TEXT,
  status TEXT NOT NULL,
  cost_micros INTEGER,
  trace_ref TEXT,
  artifact_ref TEXT,
  started_at TEXT,
  completed_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (suite_id) REFERENCES regression_suites(id),
  FOREIGN KEY (regression_case_id) REFERENCES regression_cases(id)
);

CREATE INDEX IF NOT EXISTS idx_agent_timeline_order
ON agent_timeline_events(run_id, suite_id, sequence);

COMMIT;
