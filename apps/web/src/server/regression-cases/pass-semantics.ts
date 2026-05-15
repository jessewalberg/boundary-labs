import { z } from "zod";

const evidenceItemSchema = z.object({
  type: z.string().min(1),
  value: z.string().min(1).optional()
}).passthrough();

export const passSemanticsSchema = z.object({
  protectedBehavior: z.string().trim().min(1, "Protected behavior is required."),
  requiredEvidence: z.array(evidenceItemSchema).min(1, "At least one required evidence rule is required."),
  invalidConditions: z.array(z.record(z.string(), z.unknown())).min(1, "At least one invalid-result condition is required."),
  deterministicChecks: z.array(z.record(z.string(), z.unknown())).default([]),
  judgeRubric: z.record(z.string(), z.unknown())
});

export type ValidatedPassSemantics = z.infer<typeof passSemanticsSchema>;
