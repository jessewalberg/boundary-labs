import type { SparkBucket } from "@/server/campaigns/types";
import { openDatabase } from "@/server/db/client";

export function listSparkBuckets(): SparkBucket[] {
  const bucketCount = 24;
  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const hour = new Date(now);
    hour.setUTCHours(now.getUTCHours() - (bucketCount - 1 - index));
    return {
      hour: hour.getUTCHours().toString().padStart(2, "0"),
      key: hour.toISOString().slice(0, 13),
      runs: 0,
      passTotal: 0,
      seedTotal: 0
    };
  });
  const bucketByKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  const db = openDatabase();
  try {
    const rows = db.prepare(`
      SELECT
        COALESCE(started_at, created_at) AS bucketAt,
        summary_json AS summaryJson
      FROM runs
    `).all() as Array<{ bucketAt: string; summaryJson: string }>;

    for (const row of rows) {
      const bucketAt = new Date(row.bucketAt);
      if (Number.isNaN(bucketAt.getTime()) || now.getTime() - bucketAt.getTime() > 24 * 60 * 60 * 1000) continue;
      const key = bucketAt.toISOString().slice(0, 13);
      const bucket = bucketByKey.get(key);
      if (!bucket) continue;
      const summary = parseSummary(row.summaryJson);
      bucket.runs += 1;
      bucket.passTotal += summary.pass;
      bucket.seedTotal += summary.total;
    }
  } catch (error) {
    if (!(error instanceof Error) || !/no such table/.test(error.message)) throw error;
  } finally {
    db.close();
  }

  return buckets.map((bucket) => ({
    hour: bucket.hour,
    runs: bucket.runs,
    pass: bucket.seedTotal > 0 ? bucket.passTotal / bucket.seedTotal : null
  }));
}

function parseSummary(summaryJson: string): { pass: number; total: number } {
  try {
    const summary = JSON.parse(summaryJson) as { pass?: unknown; total?: unknown };
    return {
      pass: typeof summary.pass === "number" ? summary.pass : 0,
      total: typeof summary.total === "number" ? summary.total : 0
    };
  } catch {
    return { pass: 0, total: 0 };
  }
}
