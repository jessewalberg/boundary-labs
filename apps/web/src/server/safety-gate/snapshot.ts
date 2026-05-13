import { canonicalHash } from "@/server/safety-gate/canonical-hash";
import { policySchema } from "@/server/safety-gate/schema";
import type { LoadedPolicyValue } from "@/server/safety-gate/load";

export type PolicySnapshot = {
  hash: string;
  schemaVersion: number;
  rows: Array<{
    key: string;
    domain: string;
    value: unknown;
    approvalPath: string;
    systemReserved: boolean;
    updatedAt: string;
  }>;
};

export function snapshotPolicyValues(rows: LoadedPolicyValue[]): PolicySnapshot {
  const sortedRows = rows
    .slice()
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((row) => ({
      key: row.key,
      domain: row.domain,
      value: row.value,
      approvalPath: row.approval_path,
      systemReserved: row.systemReserved,
      updatedAt: row.updated_at
    }));

  const snapshot = {
    schemaVersion: policySchema.version,
    actions: Object.keys(policySchema.actions).sort(),
    systemReservedRows: policySchema.systemReservedRows,
    rows: sortedRows
  };

  return {
    hash: canonicalHash(snapshot),
    schemaVersion: policySchema.version,
    rows: sortedRows
  };
}
