import { Chip } from "@/components/boundary/chip";
import { Panel } from "@/components/boundary/panel";
import { Button } from "@/components/ui/button";

export default function NewCampaignPage() {
  return (
    <div>
      <section className="mb-5">
        <div className="bl-eyebrow">// u1 · launch wizard placeholder</div>
        <h1 className="bl-h1 mt-2">New campaign</h1>
        <p className="mt-2 max-w-[720px] text-sm text-bl-bone-2">
          The real launch flow lands after auth, policy checks, storage, and eval-runner
          wiring are in place.
        </p>
      </section>

      <Panel watermark="// route status" right={<Chip tone="amber">stub</Chip>}>
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-bl-bone-2">
            Synthetic-only campaign creation is blocked until U5.
          </p>
          <Button disabled>Queue campaign</Button>
        </div>
      </Panel>
    </div>
  );
}
