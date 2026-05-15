import type { Verdict } from "@/components/boundary/verdict-pill";

export type CampaignStatus = "draft" | "queued" | "running" | "completed" | "failed" | "cancelled";

export type RunSummary = {
  pass: number;
  fail: number;
  partial: number;
  invalid: number;
};

export type BoundaryRun = {
  id: string;
  target: string;
  startedAt: string;
  duration: string;
  branch: string;
  commit: string;
  summary: RunSummary;
  seedCount: number;
  coverage: string[];
  trigger: "scheduler" | "manual" | "cli";
  status?: CampaignStatus;
  pydanticGraph?: {
    schemaVersion?: string;
    nodes: string[];
    agentConnections: Array<{
      role: string;
      provider: string;
      model: string;
      status: string;
      enabled: boolean;
      apiKeyConfigured: boolean;
      detail: string;
    }>;
  };
};

export type SeedAttempt = {
  id: string;
  title: string;
  category: string;
  severity: "critical" | "high" | "med" | "low" | "info";
  verdict: Verdict;
  durationMs: number;
  judge: string;
  prompt: string;
  response: string;
  rationale: string;
};

export type Finding = {
  id: string;
  seed: string;
  title: string;
  severity: "critical" | "high" | "med" | "low" | "info";
  status: "open" | "fixed" | "deferred";
  lastFail: string;
  note: string;
};

export type ThreatCoverage = {
  section: string;
  title: string;
  seedCount: number;
  passRate: number | null;
  status: "covered" | "deferred" | "semantic-only" | "adapter";
};

export type AgentStatus = {
  name: string;
  role: "RED" | "JUDGE" | "OPS";
  status: "live" | "idle";
  tone: "alarm" | "cyan" | "signal";
  task: string;
  seeds: number | null;
};

export type FeedEvent = {
  time: string;
  agent: string;
  role: "alarm" | "signal" | "cyan" | "muted";
  message: string;
  detail: string;
  href: string | null;
};

export type TargetHealth = {
  name: string;
  state: "ok" | "warn" | "deferred";
  ms: number | null;
  note: string;
};

export type SparkBucket = {
  hour: string;
  runs: number;
  pass: number | null;
};

export type CampaignRecord = {
  id: string;
  targetUrl: string;
  categories: string[];
  status: CampaignStatus;
  dataMode: "synthetic";
  budgetCents: number;
};

export type StoredCampaignRecord = CampaignRecord & {
  createdAt: string;
  updatedAt: string;
  requestedBy: string;
  relaunchedFrom?: string;
  openemrUrl?: string;
  openemrSite?: string;
  openemrUsername?: string;
  openemrPatientPid?: number;
  artifactPath: string;
  runnerCommand: {
    scriptPath: string;
    targetUrl: string;
    resultDir: "evals/results";
  };
};
