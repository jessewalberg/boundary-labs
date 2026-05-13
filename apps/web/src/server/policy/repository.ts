import { openDatabase } from "@/server/db/client";
import type { PolicyValueRow } from "@/server/db/schema";

export function listPolicyValues(): PolicyValueRow[] {
  const db = openDatabase();
  try {
    return db.prepare(`
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
      ORDER BY domain ASC, key ASC
    `).all() as PolicyValueRow[];
  } catch (error) {
    if (!(error instanceof Error) || !/no such table/.test(error.message)) throw error;
    return [];
  } finally {
    db.close();
  }
}

export function getPolicyValue(key: string): PolicyValueRow | undefined {
  return listPolicyValues().find((row) => row.key === key);
}
