import {
  policySchema,
  type ApprovalPath
} from "@/server/safety-gate/schema";
import { isApprovalPath, type LoadedPolicyValue } from "@/server/safety-gate/load";

export type PolicyWriteProposal =
  | {
      operation: "delete";
      key: string;
    }
  | {
      operation: "upsert";
      key: string;
      approvalPath?: string;
      systemReserved?: boolean;
    };

export type PolicyWriteGuardResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: string;
      deniedKey: string;
      ruleRef: string;
    };

export function evaluatePolicyWriteGuard(
  proposals: PolicyWriteProposal[],
  policyValues: Iterable<LoadedPolicyValue>
): PolicyWriteGuardResult {
  const currentRows = new Map(Array.from(policyValues).map((row) => [row.key, row]));

  for (const proposal of proposals) {
    const current = currentRows.get(proposal.key);
    const floor = floorFor(proposal.key, current);

    if (proposal.operation === "delete") {
      if (floor || current?.systemReserved) {
        return {
          ok: false,
          reason: "System-reserved policy rows cannot be deleted.",
          deniedKey: proposal.key,
          ruleRef: floor?.ruleRef ?? "R15"
        };
      }
      continue;
    }

    if (!floor) continue;

    const nextPath = proposal.approvalPath ?? current?.approval_path;
    if (!nextPath || !isApprovalPath(nextPath)) {
      return {
        ok: false,
        reason: "System-reserved policy rows require a valid approval path.",
        deniedKey: proposal.key,
        ruleRef: floor.ruleRef
      };
    }

    if (pathRank(nextPath) < pathRank(floor.minApprovalPath)) {
      return {
        ok: false,
        reason: `System-reserved policy row cannot be downgraded below ${floor.minApprovalPath}.`,
        deniedKey: proposal.key,
        ruleRef: floor.ruleRef
      };
    }
  }

  return { ok: true };
}

function floorFor(key: string, current?: LoadedPolicyValue) {
  const explicitFloor = policySchema.systemReservedRows[key as keyof typeof policySchema.systemReservedRows];
  if (explicitFloor) return explicitFloor;

  if (current?.systemReserved && isApprovalPath(current.approval_path)) {
    return {
      minApprovalPath: current.approval_path as ApprovalPath,
      ruleRef: "R15"
    };
  }

  return undefined;
}

function pathRank(path: ApprovalPath | string) {
  return policySchema.pathRank[path as ApprovalPath] ?? -1;
}
