import { Chip } from "@/components/boundary/chip";
import { FieldCard } from "@/components/boundary/field-card";
import { Panel } from "@/components/boundary/panel";
import { listPolicyValues } from "@/server/policy/repository";

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
              <FieldCard
                key={row.key}
                label={row.key}
                value={formatPolicyValue(row.value_json)}
                description={row.description}
                approvalPath={row.approval_path}
              />
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
