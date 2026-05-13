import crypto from "node:crypto";
import type { JsonValue } from "@/server/db/schema";

export function canonicalHash(value: JsonValue | unknown) {
  return crypto.createHash("sha256").update(canonicalStringify(value)).digest("hex");
}

export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)])
    );
  }

  return value;
}
