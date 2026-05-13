import Link from "next/link";
import { Plus } from "lucide-react";
import { Chip } from "@/components/boundary/chip";
import { Panel } from "@/components/boundary/panel";
import { Button } from "@/components/ui/button";

export default function CampaignsPage() {
  return (
    <div>
      <section className="mb-5 flex items-start justify-between gap-8">
        <div>
          <div className="bl-eyebrow">// u1 · campaigns placeholder</div>
          <h1 className="bl-h1 mt-2">Runs</h1>
          <p className="mt-2 max-w-[720px] text-sm text-bl-bone-2">
            Campaign list and run detail surfaces land in U5. This placeholder keeps the
            shell route map stable for auth, navigation, and smoke tests.
          </p>
        </div>
        <Button asChild variant="secondary">
          <Link href="/campaigns/new">
            <Plus size={12} aria-hidden="true" /> New campaign
          </Link>
        </Button>
      </section>

      <Panel watermark="// route status" right={<Chip tone="amber">stub</Chip>}>
        <p className="text-sm text-bl-bone-2">
          U5 will rebuild `designs/app/runs.jsx` here as a typed Campaign/Runs table.
        </p>
      </Panel>
    </div>
  );
}
