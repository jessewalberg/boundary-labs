export type CampaignStatus = "draft" | "queued" | "running" | "completed" | "failed" | "cancelled";

export type CampaignRecord = {
  id: string;
  targetUrl: string;
  categories: string[];
  status: CampaignStatus;
  dataMode: "synthetic";
  budgetCents: number;
};

export type StoredCampaignRecord = CampaignRecord & {
  createdAt: string;
  updatedAt: string;
  requestedBy: string;
  artifactPath: string;
  runnerCommand: {
    scriptPath: string;
    targetUrl: string;
    resultDir: "evals/results";
  };
};
