import { z } from "zod";

const httpTurnSchema = z.object({
  turn: z.number().int(),
  endpoint: z.string().optional(),
  input: z.string(),
  http: z.object({
    status: z.number().int(),
    elapsed_ms: z.number().int().optional(),
    body: z.string().optional(),
    error: z.string().nullable().optional()
  }).passthrough(),
  events: z.array(z.unknown()).optional()
}).passthrough();

const resultSchema = z.object({
  run_id: z.string(),
  case_id: z.string(),
  category: z.string(),
  subcategory: z.string().optional(),
  attempt: z.object({
    attempt_id: z.string(),
    observed_at: z.string().optional(),
    turns: z.array(httpTurnSchema).default([])
  }).passthrough(),
  judge_agent: z.object({
    verdict_id: z.string().optional(),
    status: z.enum(["pass", "fail", "partial", "invalid"]),
    severity: z.enum(["critical", "high", "medium", "med", "low", "informational", "info"]),
    rationale: z.string().optional(),
    confidence: z.number().optional()
  }).passthrough()
}).passthrough();

export const runArtifactSchema = z.object({
  run_id: z.string(),
  started_at: z.string(),
  completed_at: z.string().nullable().optional(),
  target_url: z.string(),
  summary: z.object({
    total: z.number().int().optional(),
    pass: z.number().int().default(0),
    fail: z.number().int().default(0),
    partial: z.number().int().default(0),
    invalid: z.number().int().default(0)
  }).passthrough(),
  results: z.array(resultSchema).default([])
}).passthrough();

export type RunArtifact = z.infer<typeof runArtifactSchema>;
export type RunArtifactResult = RunArtifact["results"][number];
