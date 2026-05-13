import { Chip } from "@/components/boundary/chip";
import { Panel } from "@/components/boundary/panel";

export default async function CampaignDetailPage({
  params
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;

  return (
    <div>
      <section className="mb-5">
        <div className="bl-eyebrow">// u1 · campaign detail placeholder</div>
        <h1 className="bl-h1 mt-2">{campaignId}</h1>
      </section>

      <Panel watermark="// route status" right={<Chip tone="amber">stub</Chip>}>
        <p className="text-sm text-bl-bone-2">
          U5 will load run artifacts, seed attempts, judge verdicts, and evidence panes here.
        </p>
      </Panel>
    </div>
  );
}
