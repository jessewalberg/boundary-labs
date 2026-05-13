import { Chip } from "@/components/boundary/chip";
import { FieldCard } from "@/components/boundary/field-card";
import { Panel } from "@/components/boundary/panel";
import { Button } from "@/components/ui/button";
import { listPolicyValues } from "@/server/policy/repository";
import { requestPolicyEditAction } from "./actions";

export default function PolicyPage() {
  const rows = listPolicyValues().filter((row) => row.system_reserved === 0);
  const grouped = rows.reduce((groups, row) => {
    const domainRows = groups.get(row.domain) ?? [];
    domainRows.push(row);
    groups.set(row.domain, domainRows);
    return groups;
  }, new Map<string, typeof rows>());

  return (
    <div className="pb-8">
      <section className="mb-5 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="bl-eyebrow">// trust · policy table</div>
          <h1 className="bl-h1 mt-2 uppercase">Policy</h1>
          <p className="mt-2 max-w-[780px] text-sm leading-6 text-bl-bone-2">
            Read-only Safety Gate values that define where autonomous agents may act and where
            human approval is required.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip tone="signal">{rows.length} visible rows</Chip>
          <Chip tone="cyan">read-only</Chip>
        </div>
      </section>

      <div className="grid gap-4">
        {Array.from(grouped.entries()).map(([domain, domainRows]) => (
          <Panel
            key={domain}
            watermark={`// ${domain.toLowerCase()} · policy_values`}
            right={<Chip>{domainRows.length} rows</Chip>}
            padded={false}
          >
            {domainRows.map((row) => (
              <div key={row.key} className="border-b border-bl-line last:border-b-0">
                <FieldCard
                  label={row.key}
                  value={formatPolicyValue(row.value_json)}
                  description={row.description}
                  approvalPath={row.approval_path}
                />
                <form action={requestPolicyEditAction.bind(null, row.key)} className="grid gap-2 px-4 pb-4 md:grid-cols-[1fr_180px_auto] md:items-end">
                  <label className="grid gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-bl-bone-4">
                    Value JSON
                    <textarea
                      name="valueJson"
                      defaultValue={formatPolicyValue(row.value_json)}
                      className="min-h-20 resize-none border border-bl-line bg-bl-trough p-2 text-xs normal-case tracking-normal text-bl-bone outline-none"
                    />
                  </label>
                  <label className="grid gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-bl-bone-4">
                    Approval path
                    <select name="approvalPath" defaultValue={row.approval_path} className="h-9 border border-bl-line bg-bl-trough px-2 text-xs text-bl-bone outline-none">
                      <option value="auto">auto</option>
                      <option value="reviewer">reviewer</option>
                      <option value="admin">admin</option>
                      <option value="deny">deny</option>
                    </select>
                  </label>
                  <Button type="submit" variant="secondary" size="sm">Request edit</Button>
                </form>
              </div>
            ))}
          </Panel>
        ))}
        {rows.length === 0 ? (
          <Panel watermark="// policy_values">
            <p className="m-0 text-sm text-bl-bone-3">No policy rows are visible yet.</p>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}

function formatPolicyValue(valueJson: string) {
  try {
    return JSON.stringify(JSON.parse(valueJson), null, 2);
  } catch {
    return valueJson;
  }
}
