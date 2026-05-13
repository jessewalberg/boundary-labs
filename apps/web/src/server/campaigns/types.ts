export type CampaignStatus = "draft" | "queued" | "running" | "completed" | "failed";

export type CampaignRecord = {
  id: string;
  targetUrl: string;
  categories: string[];
  status: CampaignStatus;
  dataMode: "synthetic";
  budgetCents: number;
};
