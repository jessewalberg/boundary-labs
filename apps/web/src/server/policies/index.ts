export type PolicyAction =
  | "campaign:create"
  | "campaign:run"
  | "campaign:cancel"
  | "finding:triage"
  | "target:manage"
  | "policy:write"
  | "seed:promote"
  | "approval:review"
  | "secret:manage"
  | "schedule:manage";

export type OperatorRole = "admin" | "operator" | "reviewer";

const roleActions: Record<OperatorRole, PolicyAction[]> = {
  admin: [
    "campaign:create",
    "campaign:run",
    "campaign:cancel",
    "finding:triage",
    "target:manage",
    "policy:write",
    "seed:promote",
    "approval:review",
    "secret:manage",
    "schedule:manage"
  ],
  operator: ["campaign:create", "campaign:run", "campaign:cancel"],
  reviewer: ["finding:triage", "seed:promote", "approval:review"]
};

export function can(role: OperatorRole, action: PolicyAction) {
  return roleActions[role].includes(action);
}
