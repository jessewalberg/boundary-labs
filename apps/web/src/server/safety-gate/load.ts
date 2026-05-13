import { policySchema, type ApprovalPath } from "@/server/safety-gate/schema";
import type { JsonValue, PolicyValueRow } from "@/server/db/schema";
import type { BoundaryDatabase } from "@/server/db/client";

export type LoadedPolicyValue = PolicyValueRow & {
  value: JsonValue;
  systemReserved: boolean;
};

export type PolicyValueMap = Map<string, LoadedPolicyValue>;

export function loadPolicyValues(db: BoundaryDatabase): LoadedPolicyValue[] {
  const rows = db.prepare(`
    SELECT
      key,
      domain,
      value_json,
      value_type,
      approval_path,
      system_reserved,
      description,
      updated_at,
      updated_by
    FROM policy_values
    ORDER BY key ASC
  `).all() as PolicyValueRow[];

  return rows.map((row) => ({
    ...row,
    value: JSON.parse(row.value_json) as JsonValue,
    systemReserved: row.system_reserved === 1
  }));
}

export function loadPolicyValueMap(db: BoundaryDatabase) {
  return new Map(loadPolicyValues(db).map((row) => [row.key, row]));
}

export function assertPolicySchemaLoaded() {
  if (!policySchema || Object.keys(policySchema.actions).length === 0) {
    throw new Error("Safety Gate policy schema is missing or empty.");
  }
}

export function missingSystemReservedRows(rows: Iterable<LoadedPolicyValue>) {
  const rowMap = new Map(Array.from(rows).map((row) => [row.key, row]));

  return Object.keys(policySchema.systemReservedRows).filter((key) => !rowMap.get(key));
}

export function assertSystemReservedRowsPresent(rows: Iterable<LoadedPolicyValue>) {
  const missing = missingSystemReservedRows(rows);
  if (missing.length > 0) {
    throw new Error(`Safety Gate policy_values is missing system-reserved rows: ${missing.join(", ")}`);
  }
}

export function policyValue(map: PolicyValueMap, key: string) {
  return map.get(key);
}

export function approvalPathFor(map: PolicyValueMap, key: string, fallback: ApprovalPath): ApprovalPath {
  const row = policyValue(map, key);
  if (!row) return fallback;
  if (!isApprovalPath(row.approval_path)) return fallback;
  return row.approval_path;
}

export function valueFor<T extends JsonValue>(map: PolicyValueMap, key: string, fallback: T): T {
  const row = policyValue(map, key);
  return (row ? row.value : fallback) as T;
}

export function isApprovalPath(value: string): value is ApprovalPath {
  return (policySchema.approvalPaths as readonly string[]).includes(value);
}
