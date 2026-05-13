import { listSeedAttemptRecords } from "@/server/attempts/repository";

export function listRecentVerdicts(limit = 20) {
  return listSeedAttemptRecords().slice(0, limit);
}
