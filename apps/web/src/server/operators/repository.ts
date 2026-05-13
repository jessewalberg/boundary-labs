import { APIError } from "better-auth/api";
import { ulid } from "ulid";
import { getBoundaryConfig } from "@/server/config";
import { openDatabase, type BoundaryDatabase } from "@/server/db/client";
import type { OperatorRole } from "@/server/policies";

export type OperatorRecord = {
  id: string;
  authUserId: string | null;
  provider: string;
  providerSub: string;
  email: string;
  name: string | null;
  role: OperatorRole;
  status: "active" | "revoked";
};

type BetterAuthUser = {
  id: string;
  email: string;
  name?: string | null;
};

type BetterAuthAccount = {
  userId: string;
  providerId: string;
  accountId: string;
};

export function assertEmailCanAuthenticate(email: string) {
  const normalized = email.toLowerCase();
  const config = getBoundaryConfig();
  const allowlist = new Set(config.operatorEmailAllowlist);
  const ownerEmail = config.ownerEmail?.toLowerCase();

  if (ownerEmail && normalized === ownerEmail) return;
  if (allowlist.has(normalized)) return;
  if (allowlist.size === 0 && process.env.NODE_ENV !== "production") return;

  throw new APIError("FORBIDDEN", {
    message: "Email is not allowlisted for Boundary Labs."
  });
}

export function ensureOperatorForAccount(user: BetterAuthUser, account: BetterAuthAccount) {
  assertEmailCanAuthenticate(user.email);

  const db = openDatabase();
  try {
    const existing = findOperatorByProvider(db, account.providerId, account.accountId);
    if (existing?.status === "revoked") {
      throw new APIError("FORBIDDEN", {
        message: "Operator access has been revoked."
      });
    }

    const now = new Date().toISOString();
    const role = roleForEmail(user.email);
    const operatorId = existing?.id ?? ulid();

    db.prepare(`
      INSERT INTO operators (
        id, auth_user_id, provider, provider_sub, email, name, role, status, created_at, updated_at
      ) VALUES (
        @id, @auth_user_id, @provider, @provider_sub, @email, @name, @role, 'active', @created_at, @updated_at
      )
      ON CONFLICT(provider, provider_sub) DO UPDATE SET
        auth_user_id = excluded.auth_user_id,
        email = excluded.email,
        name = excluded.name,
        role = CASE WHEN operators.status = 'revoked' THEN operators.role ELSE excluded.role END,
        updated_at = excluded.updated_at
    `).run({
      id: operatorId,
      auth_user_id: user.id,
      provider: account.providerId,
      provider_sub: account.accountId,
      email: user.email.toLowerCase(),
      name: user.name ?? null,
      role,
      created_at: now,
      updated_at: now
    });

    return getOperatorByAuthUserId(user.id, db);
  } finally {
    db.close();
  }
}

export function getOperatorByAuthUserId(authUserId: string, existingDb?: BoundaryDatabase) {
  const db = existingDb ?? openDatabase();
  try {
    const row = db.prepare(`
      SELECT
        id,
        auth_user_id AS authUserId,
        provider,
        provider_sub AS providerSub,
        email,
        name,
        role,
        status
      FROM operators
      WHERE auth_user_id = ?
    `).get(authUserId) as OperatorRecord | undefined;

    return row;
  } finally {
    if (!existingDb) db.close();
  }
}

export function revokeOperator(provider: string, providerSub: string) {
  const db = openDatabase();
  try {
    db.prepare(`
      UPDATE operators
      SET status = 'revoked', updated_at = ?
      WHERE provider = ? AND provider_sub = ?
    `).run(new Date().toISOString(), provider, providerSub);
  } finally {
    db.close();
  }
}

function findOperatorByProvider(db: BoundaryDatabase, provider: string, providerSub: string) {
  return db.prepare(`
    SELECT
      id,
      auth_user_id AS authUserId,
      provider,
      provider_sub AS providerSub,
      email,
      name,
      role,
      status
    FROM operators
    WHERE provider = ? AND provider_sub = ?
  `).get(provider, providerSub) as OperatorRecord | undefined;
}

function roleForEmail(email: string): OperatorRole {
  const config = getBoundaryConfig();
  return config.ownerEmail && email.toLowerCase() === config.ownerEmail ? "admin" : "operator";
}
