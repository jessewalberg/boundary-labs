import { ulid } from "ulid";
import { openDatabase } from "@/server/db/client";
import type { ReportRow, ReportStatus, Severity } from "@/server/db/schema";

export type ReportEvidenceItem = {
  type: string;
  ref?: string;
  detail?: string;
};

export type ReportInput = {
  vulnId: string;
  findingId: string | null;
  runId: string | null;
  regressionCaseId: string | null;
  title: string;
  severity: Severity;
  status: ReportStatus;
  attackCategory: string | null;
  affectedTargetVersion: string | null;
  clinicalImpact: string | null;
  summaryMd: string | null;
  reproSequenceMd: string | null;
  expectedBehaviorMd: string | null;
  observedBehaviorMd: string | null;
  evidence: ReportEvidenceItem[];
  exploitabilityMd: string | null;
  remediationMd: string | null;
  approvalNotesMd: string | null;
  artifactPath: string | null;
  createdBy: string;
  reportVersion?: number;
};

export type ReportRecord = {
  id: string;
  vulnId: string | null;
  findingId: string | null;
  runId: string | null;
  regressionCaseId: string | null;
  title: string;
  severity: Severity | null;
  status: ReportStatus;
  attackCategory: string | null;
  affectedTargetVersion: string | null;
  clinicalImpact: string | null;
  summaryMd: string | null;
  reproSequenceMd: string | null;
  expectedBehaviorMd: string | null;
  observedBehaviorMd: string | null;
  evidence: ReportEvidenceItem[];
  exploitabilityMd: string | null;
  remediationMd: string | null;
  approvalNotesMd: string | null;
  artifactPath: string | null;
  reportVersion: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

const SELECT_COLUMNS = `
  id,
  finding_id,
  run_id,
  regression_case_id,
  vuln_id,
  severity,
  attack_category,
  affected_target_version,
  clinical_impact,
  summary_md,
  repro_sequence_md,
  expected_behavior_md,
  observed_behavior_md,
  evidence_json,
  exploitability_md,
  remediation_md,
  approval_notes_md,
  report_version,
  status,
  title,
  artifact_path,
  created_by,
  created_at,
  updated_at
`;

export function insertReport(input: ReportInput): string {
  const id = `rpt_${ulid()}`;
  const now = new Date().toISOString();
  const db = openDatabase();
  try {
    db.prepare(`
      INSERT INTO reports (
        id, finding_id, run_id, regression_case_id, vuln_id,
        severity, attack_category, affected_target_version, clinical_impact,
        summary_md, repro_sequence_md, expected_behavior_md, observed_behavior_md,
        evidence_json, exploitability_md, remediation_md, approval_notes_md,
        report_version, status, title, artifact_path, created_by,
        created_at, updated_at
      ) VALUES (
        @id, @finding_id, @run_id, @regression_case_id, @vuln_id,
        @severity, @attack_category, @affected_target_version, @clinical_impact,
        @summary_md, @repro_sequence_md, @expected_behavior_md, @observed_behavior_md,
        @evidence_json, @exploitability_md, @remediation_md, @approval_notes_md,
        @report_version, @status, @title, @artifact_path, @created_by,
        @created_at, @updated_at
      )
    `).run({
      id,
      finding_id: input.findingId,
      run_id: input.runId,
      regression_case_id: input.regressionCaseId,
      vuln_id: input.vulnId,
      severity: input.severity,
      attack_category: input.attackCategory,
      affected_target_version: input.affectedTargetVersion,
      clinical_impact: input.clinicalImpact,
      summary_md: input.summaryMd,
      repro_sequence_md: input.reproSequenceMd,
      expected_behavior_md: input.expectedBehaviorMd,
      observed_behavior_md: input.observedBehaviorMd,
      evidence_json: JSON.stringify(input.evidence),
      exploitability_md: input.exploitabilityMd,
      remediation_md: input.remediationMd,
      approval_notes_md: input.approvalNotesMd,
      report_version: input.reportVersion ?? 1,
      status: input.status,
      title: input.title,
      artifact_path: input.artifactPath,
      created_by: input.createdBy,
      created_at: now,
      updated_at: now
    });
    return id;
  } finally {
    db.close();
  }
}

export function listReports(): ReportRecord[] {
  return queryReports(`ORDER BY updated_at DESC`);
}

export function listReportsByFinding(findingId: string): ReportRecord[] {
  return queryReports(`WHERE finding_id = ? ORDER BY report_version DESC, updated_at DESC`, [findingId]);
}

export function listReportsByRun(runId: string): ReportRecord[] {
  return queryReports(`WHERE run_id = ? ORDER BY updated_at DESC`, [runId]);
}

export function getReport(id: string): ReportRecord | null {
  const results = queryReports(`WHERE id = ? LIMIT 1`, [id]);
  return results[0] ?? null;
}

export function getReportByVulnId(vulnId: string): ReportRecord | null {
  const results = queryReports(`WHERE vuln_id = ? LIMIT 1`, [vulnId]);
  return results[0] ?? null;
}

function queryReports(suffix: string, params: unknown[] = []): ReportRecord[] {
  const db = openDatabase();
  try {
    const rows = db.prepare(`SELECT ${SELECT_COLUMNS} FROM reports ${suffix}`).all(...params) as ReportRow[];
    return rows.map(rowToRecord);
  } catch (error) {
    if (!(error instanceof Error) || !/no such table/.test(error.message)) throw error;
    return [];
  } finally {
    db.close();
  }
}

function rowToRecord(row: ReportRow): ReportRecord {
  let evidence: ReportEvidenceItem[] = [];
  try {
    const parsed = JSON.parse(row.evidence_json || "[]");
    if (Array.isArray(parsed)) evidence = parsed as ReportEvidenceItem[];
  } catch {
    evidence = [];
  }
  return {
    id: row.id,
    vulnId: row.vuln_id,
    findingId: row.finding_id,
    runId: row.run_id,
    regressionCaseId: row.regression_case_id,
    title: row.title,
    severity: row.severity,
    status: row.status,
    attackCategory: row.attack_category,
    affectedTargetVersion: row.affected_target_version,
    clinicalImpact: row.clinical_impact,
    summaryMd: row.summary_md,
    reproSequenceMd: row.repro_sequence_md,
    expectedBehaviorMd: row.expected_behavior_md,
    observedBehaviorMd: row.observed_behavior_md,
    evidence,
    exploitabilityMd: row.exploitability_md,
    remediationMd: row.remediation_md,
    approvalNotesMd: row.approval_notes_md,
    artifactPath: row.artifact_path,
    reportVersion: row.report_version,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export type LifecycleEvent = {
  status: string;
  createdAt: string;
  note: string | null;
  evidenceRunId: string | null;
};

export function renderReportMarkdown(report: ReportRecord, lifecycleEvents: LifecycleEvent[] = []): string {
  const header = `# ${report.vulnId ?? report.id}: ${report.title}`;
  const meta = [
    `Severity: ${report.severity ?? "unknown"}`,
    `Status: ${report.status}`,
    `Affected target version: ${report.affectedTargetVersion ?? "unspecified"}`,
    `Attack category: ${report.attackCategory ?? "unspecified"}`,
    `Clinical impact: ${report.clinicalImpact ?? "unspecified"}`
  ].join("\n");

  const sections = [
    section("Summary", report.summaryMd),
    section("Minimal Reproduction", report.reproSequenceMd),
    section("Expected Safe Behavior", report.expectedBehaviorMd),
    section("Observed Behavior", report.observedBehaviorMd),
    section("Evidence", renderEvidence(report.evidence)),
    section("Exploitability", report.exploitabilityMd),
    section("Recommended Remediation", report.remediationMd),
    section("Fix Validation History", renderLifecycle(lifecycleEvents)),
    section("Approval And Disclosure Notes", report.approvalNotesMd)
  ];

  return [header, "", meta, "", ...sections].join("\n").trim() + "\n";
}

function section(heading: string, body: string | null): string {
  return `## ${heading}\n\n${body && body.trim().length > 0 ? body.trim() : "_Not yet documented._"}\n`;
}

function renderEvidence(items: ReportEvidenceItem[]): string {
  if (items.length === 0) return "_No evidence references attached._";
  return items
    .map((item) => `- **${item.type}** — \`${item.ref ?? "(no ref)"}\`${item.detail ? ` · ${item.detail}` : ""}`)
    .join("\n");
}

function renderLifecycle(events: LifecycleEvent[]): string {
  if (events.length === 0) {
    return "_No fix validation events recorded yet._";
  }
  return events
    .map((event) => {
      const run = event.evidenceRunId ? ` (run/${event.evidenceRunId})` : "";
      const note = event.note ? ` — ${event.note}` : "";
      return `- ${event.createdAt} · **${event.status}**${run}${note}`;
    })
    .join("\n");
}
