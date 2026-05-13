export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type OperatorRole = "admin" | "operator" | "reviewer";
export type OperatorStatus = "active" | "revoked";
export type CampaignStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type Severity = "critical" | "high" | "med" | "low" | "info";
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type JobStatus = "queued" | "claimed" | "completed" | "failed" | "cancelled";

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
