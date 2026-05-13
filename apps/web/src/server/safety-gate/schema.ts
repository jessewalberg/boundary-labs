export const approvalPaths = ["auto", "reviewer", "admin", "deny"] as const;
export type ApprovalPath = (typeof approvalPaths)[number];

export const policySchema = {
  version: 1,
  roles: ["admin", "operator", "reviewer"],
  approvalPaths,
  pathRank: {
    auto: 0,
    reviewer: 1,
    admin: 2,
    deny: 3
  },
  systemReservedRows: {
    "policy:write": { minApprovalPath: "admin", ruleRef: "R15" },
    baa_acknowledged: { minApprovalPath: "admin", ruleRef: "R16" },
    red_team_mode: { minApprovalPath: "admin", ruleRef: "R16" },
    target_allowlist_add: { minApprovalPath: "admin", ruleRef: "R16" },
    data_mode_flip_real_phi: { minApprovalPath: "admin", ruleRef: "R16" }
  },
  actions: {
    "campaign:create": {
      ruleRef: "R3,R9",
      allowedRoles: ["admin", "operator"],
      defaultApprovalPath: "auto",
      requiredPolicyKeys: []
    },
    "campaign:run": {
      ruleRef: "R9",
      allowedRoles: ["admin", "operator"],
      defaultApprovalPath: "auto",
      requiredPolicyKeys: []
    },
    "campaign:cancel": {
      ruleRef: "R24",
      allowedRoles: ["admin", "operator"],
      defaultApprovalPath: "auto",
      requiredPolicyKeys: ["campaign_cancel"]
    },
    "finding:triage": {
      ruleRef: "R12",
      allowedRoles: ["admin", "operator", "reviewer"],
      defaultApprovalPath: "auto",
      requiredPolicyKeys: []
    },
    "target:manage": {
      ruleRef: "R16",
      allowedRoles: ["admin"],
      defaultApprovalPath: "admin",
      requiredPolicyKeys: ["target_allowlist_add"]
    },
    "policy:write": {
      ruleRef: "R15",
      allowedRoles: ["admin"],
      defaultApprovalPath: "admin",
      requiredPolicyKeys: ["policy:write"]
    },
    "seed:promote": {
      ruleRef: "R16",
      allowedRoles: ["admin", "reviewer"],
      defaultApprovalPath: "reviewer",
      requiredPolicyKeys: ["regression_promote"]
    },
    "approval:review": {
      ruleRef: "R25",
      allowedRoles: ["admin", "reviewer"],
      defaultApprovalPath: "auto",
      requiredPolicyKeys: []
    },
    "secret:manage": {
      ruleRef: "R22",
      allowedRoles: ["admin"],
      defaultApprovalPath: "admin",
      requiredPolicyKeys: []
    },
    "schedule:manage": {
      ruleRef: "R21",
      allowedRoles: ["admin"],
      defaultApprovalPath: "admin",
      requiredPolicyKeys: ["orchestrator_sweep_cadence"]
    },
    "red_team:mutate_seed": {
      ruleRef: "R16",
      allowedRoles: [],
      defaultApprovalPath: "auto",
      requiredPolicyKeys: ["red_team_mutate_med", "red_team_mutate_high_critical", "red_team_pending_cap"]
    },
    "red_team:new_category": {
      ruleRef: "R16",
      allowedRoles: [],
      defaultApprovalPath: "reviewer",
      requiredPolicyKeys: ["red_team_new_category"]
    },
    "orchestrator:regression_sweep": {
      ruleRef: "R16",
      allowedRoles: [],
      defaultApprovalPath: "auto",
      requiredPolicyKeys: ["orchestrator_regression_sweep"]
    },
    "orchestrator:new_category": {
      ruleRef: "R16",
      allowedRoles: [],
      defaultApprovalPath: "reviewer",
      requiredPolicyKeys: ["orchestrator_new_category"]
    },
    "judge:verdict": {
      ruleRef: "R16",
      allowedRoles: [],
      defaultApprovalPath: "auto",
      requiredPolicyKeys: ["judge_verdict", "judge_calibration_threshold"]
    },
    "documentation:draft": {
      ruleRef: "R16",
      allowedRoles: [],
      defaultApprovalPath: "auto",
      requiredPolicyKeys: ["documentation_draft"]
    },
    "report:publish": {
      ruleRef: "R16",
      allowedRoles: ["admin", "reviewer"],
      defaultApprovalPath: "reviewer",
      requiredPolicyKeys: ["report_publish"]
    },
    "regression:promote": {
      ruleRef: "R16",
      allowedRoles: ["admin", "reviewer"],
      defaultApprovalPath: "reviewer",
      requiredPolicyKeys: ["regression_promote"]
    },
    "target:allowlist_add": {
      ruleRef: "R16",
      allowedRoles: ["admin"],
      defaultApprovalPath: "admin",
      requiredPolicyKeys: ["target_allowlist_add"]
    },
    "data_mode:flip_real_phi": {
      ruleRef: "R16",
      allowedRoles: ["admin"],
      defaultApprovalPath: "admin",
      requiredPolicyKeys: ["data_mode_flip_real_phi", "baa_acknowledged"]
    },
    "budget:raise": {
      ruleRef: "R16",
      allowedRoles: ["admin"],
      defaultApprovalPath: "admin",
      requiredPolicyKeys: ["budget_cap_raise"]
    },
    "low_signal:stop_rule": {
      ruleRef: "R16",
      allowedRoles: [],
      defaultApprovalPath: "auto",
      requiredPolicyKeys: ["low_signal_stop_rule"]
    }
  },
  roleActions: {
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
      "schedule:manage",
      "report:publish",
      "regression:promote",
      "target:allowlist_add",
      "data_mode:flip_real_phi",
      "budget:raise"
    ],
    operator: ["campaign:create", "campaign:run", "campaign:cancel", "finding:triage"],
    reviewer: ["finding:triage", "seed:promote", "approval:review", "report:publish", "regression:promote"]
  }
} as const;

export type PolicySchema = typeof policySchema;
export type PolicyAction = keyof PolicySchema["actions"];
export type OperatorRole = PolicySchema["roles"][number];
export type PolicyValueKey =
  | PolicyAction
  | keyof PolicySchema["systemReservedRows"]
  | PolicySchema["actions"][PolicyAction]["requiredPolicyKeys"][number];

export function isPolicyAction(value: string): value is PolicyAction {
  return value in policySchema.actions;
}
