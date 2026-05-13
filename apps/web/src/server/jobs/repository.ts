import { openDatabase } from "@/server/db/client";

export type CampaignJobRecord = {
  id: string;
  campaignId: string;
  jobType: string;
  status: string;
  claimToken: string | null;
  claimedAt: string | null;
  submittedBy: string;
  createdAt: string;
  updatedAt: string;
};

export function listCampaignJobs(status?: string): CampaignJobRecord[] {
  const db = openDatabase();
  try {
    const sql = `
      SELECT
        id,
        campaign_id AS campaignId,
        job_type AS jobType,
        status,
        claim_token AS claimToken,
        claimed_at AS claimedAt,
        submitted_by AS submittedBy,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM campaign_jobs
      ${status ? "WHERE status = ?" : ""}
      ORDER BY priority DESC, created_at ASC
    `;
    return (status ? db.prepare(sql).all(status) : db.prepare(sql).all()) as CampaignJobRecord[];
  } catch (error) {
    if (!(error instanceof Error) || !/no such table/.test(error.message)) throw error;
    return [];
  } finally {
    db.close();
  }
}
