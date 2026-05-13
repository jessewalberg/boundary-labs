import { FileCheck2, ShieldAlert } from "lucide-react";
import { BaaConfirmInput } from "@/components/boundary/baa-confirm-input";
import { Chip } from "@/components/boundary/chip";
import { Panel } from "@/components/boundary/panel";
import { ProtectedBadge } from "@/components/boundary/protected-badge";
import { getBaaAcknowledgementState } from "@/server/baa/repository";
import { confirmBaaAction } from "./actions";

export default function BaaSettingsPage() {
  const state = getBaaAcknowledgementState();

  return (
    <div className="pb-8">
      <section className="mb-5 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="bl-eyebrow">// settings · baa</div>
          <h1 className="bl-h1 mt-2 uppercase">BAA</h1>
          <p className="mt-2 max-w-[760px] text-sm leading-6 text-bl-bone-2">
            Hash confirmation gate for any future real-PHI data mode. The source document hash stays
            in Railway environment configuration, outside the repository.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip tone={state.hashConfigured ? "signal" : "amber"}>
            {state.hashConfigured ? "hash configured" : "hash missing"}
          </Chip>
          <Chip tone={state.acknowledged ? "signal" : "muted"}>
            {state.acknowledged ? "acknowledged" : "not acknowledged"}
          </Chip>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
        <Panel watermark="// baa_acknowledged" right={<ProtectedBadge />}>
          {state.hashConfigured ? (
            state.acknowledged ? (
              <div className="grid gap-4">
                <FileCheck2 size={24} className="text-bl-signal" aria-hidden="true" />
                <div>
                  <h2 className="m-0 font-mono text-sm uppercase tracking-[0.12em] text-bl-bone">
                    Confirmed
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-bl-bone-2">
                    The BAA hash has been confirmed and audited. Real-PHI mode remains gated by the
                    separate data-mode approval path.
                  </p>
                </div>
                <div className="grid gap-2 font-mono text-[11px] text-bl-bone-3">
                  <Row label="updated_by" value={state.updatedBy ?? "--"} />
                  <Row label="updated_at" value={state.updatedAt ?? "--"} />
                </div>
              </div>
            ) : (
              <div className="grid gap-4">
                <p className="m-0 text-sm leading-6 text-bl-bone-2">
                  Type the out-of-band BAA document hash exactly to flip the reserved
                  <span className="font-mono text-bl-bone"> baa_acknowledged</span> policy row.
                </p>
                <BaaConfirmInput action={confirmBaaAction} />
              </div>
            )
          ) : (
            <div className="grid gap-3">
              <ShieldAlert size={24} className="text-bl-amber" aria-hidden="true" />
              <p className="m-0 text-sm leading-6 text-bl-bone-2">
                BAA not configured. Set <span className="font-mono text-bl-bone">BAA_DOCUMENT_HASH</span> in
                Railway environment settings before this acknowledgement can be recorded.
              </p>
            </div>
          )}
        </Panel>

        <Panel watermark="// real_phi gate" right={<Chip tone="amber">admin approval</Chip>}>
          <div className="grid gap-3 text-sm leading-6 text-bl-bone-2">
            <p className="m-0">
              BAA confirmation only satisfies the legal-readiness prerequisite. The Safety Gate still
              requires the protected <span className="font-mono text-bl-bone">data_mode_flip_real_phi</span>{" "}
              approval path before live PHI is allowed.
            </p>
            <div className="grid gap-2 font-mono text-[11px] text-bl-bone-3">
              <Row label="rule" value="R16" />
              <Row label="policy_row" value="baa_acknowledged" />
              <Row label="audit_action" value="baa_acknowledged" />
            </div>
          </div>
        </Panel>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3">
      <span className="text-bl-bone-4">{label}</span>
      <span className="break-all text-bl-bone-2">{value}</span>
    </div>
  );
}
