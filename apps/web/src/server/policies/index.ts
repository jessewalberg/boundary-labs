export type PolicyAction =
  | "campaign:create"
  | "campaign:run"
  | "campaign:cancel"
  | "finding:triage"
  | "target:manage";

export type OperatorRole = "owner" | "admin" | "operator" | "reviewer" | "viewer";

const roleActions: Record<OperatorRole, PolicyAction[]> = {
  owner: ["campaign:create", "campaign:run", "campaign:cancel", "finding:triage", "target:manage"],
  admin: ["campaign:create", "campaign:run", "campaign:cancel", "finding:triage", "target:manage"],
  operator: ["campaign:create", "campaign:run", "campaign:cancel"],
  reviewer: ["finding:triage"],
  viewer: []
};

export function can(role: OperatorRole, action: PolicyAction) {
  return roleActions[role].includes(action);
}
