export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type OperatorRole = "admin" | "operator" | "reviewer";
export type OperatorStatus = "active" | "revoked";
export type CampaignStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type Severity = "critical" | "high" | "med" | "low" | "info";
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type JobStatus = "queued" | "claimed" | "completed" | "failed" | "cancelled";
export type RegressionCaseStatus = "active" | "retired";
export type RegressionResultStatus = "pass" | "fail" | "partial" | "invalid";
export type VulnerabilityLifecycleStatus =
  | "open"
  | "in_progress"
  | "fixed_pending_verification"
  | "resolved"
  | "reopened"
  | "deferred";
export type CostProvenance = "provider_reported" | "estimated" | "unavailable";
export type ReportStatus = "draft" | "published" | "superseded";

export type AuditEventRow = {
  id: string;
  occurred_at: string;
  actor_type: string;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  outcome: string;
  rule_ref: string | null;
  policy_snapshot_hash: string | null;
  metadata_json: string;
};

export type PolicyValueRow = {
  key: string;
  domain: string;
  value_json: string;
  value_type: string;
  approval_path: string;
  system_reserved: 0 | 1;
  description: string;
  updated_at: string;
  updated_by: string;
};

export type SeedRow = {
  id: string;
  category: string;
  category_slug: string;
  title: string;
  severity: Severity;
  prompt_template: string;
  version: number;
  content_hash: string;
  source_file: string;
  created_at: string;
  updated_at: string;
};

export type TargetVersionRow = {
  id: string;
  version_key: string;
  label: string | null;
  source: string;
  comparable: 0 | 1;
  created_at: string;
};

export type RegressionCaseRow = {
  id: string;
  finding_id: string | null;
  approval_id: string | null;
  source_seed_id: string | null;
  source_case_id: string | null;
  category: string;
  severity: Severity;
  title: string;
  status: RegressionCaseStatus;
  created_at: string;
  updated_at: string;
};

export type RegressionSuiteResultRow = {
  id: string;
  suite_id: string;
  regression_case_id: string;
  target_version_id: string;
  run_id: string | null;
  status: RegressionResultStatus;
  category: string;
  evidence_json: string;
  invalid_reason: string | null;
  is_reappearance: 0 | 1;
  is_cross_category_regression: 0 | 1;
  created_at: string;
};

export type ReportRow = {
  id: string;
  finding_id: string | null;
  run_id: string | null;
  regression_case_id: string | null;
  vuln_id: string | null;
  severity: Severity | null;
  attack_category: string | null;
  affected_target_version: string | null;
  clinical_impact: string | null;
  summary_md: string | null;
  repro_sequence_md: string | null;
  expected_behavior_md: string | null;
  observed_behavior_md: string | null;
  evidence_json: string;
  exploitability_md: string | null;
  remediation_md: string | null;
  approval_notes_md: string | null;
  report_version: number;
  status: ReportStatus;
  title: string;
  artifact_path: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};
