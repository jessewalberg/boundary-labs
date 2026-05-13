import type { ReactNode } from "react";
import Link from "next/link";
import { Activity, Gauge, Search, Shield, Terminal } from "lucide-react";
import { Chip } from "@/components/boundary/chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const navGroups = [
  {
    label: "// workspace",
    items: [
      { label: "Dashboard", href: "/dashboard", enabled: true },
      { label: "Runs", href: "/campaigns", enabled: true },
      { label: "Seeds", href: "/seeds", enabled: false },
      { label: "Agents", href: "/agents", enabled: false },
      { label: "Judges", href: "/judges", enabled: false }
    ]
  },
  {
    label: "// review",
    items: [
      { label: "Threat Model", href: "/threat-model", enabled: false },
      { label: "Coverage", href: "/coverage", enabled: false },
      { label: "Findings", href: "/findings", enabled: false }
    ]
  },
  {
    label: "// system",
    items: [
      { label: "Targets", href: "/targets", enabled: false },
      { label: "Secrets", href: "/secrets", enabled: false },
      { label: "Schedule", href: "/schedule", enabled: false }
    ]
  }
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-bl-graphite text-bl-bone">
      <aside className="fixed inset-y-0 left-0 flex w-[232px] flex-col gap-3 border-r border-bl-line bg-bl-void px-3 py-4">
        <Link href="/dashboard" className="flex items-center gap-2 px-1 pb-2">
          <img src="/brand/logo-mark.svg" alt="" className="h-5 w-5" />
          <span className="font-mono text-sm font-semibold tracking-[-0.01em]">
            BOUNDARY <span className="font-normal text-bl-bone-3">LABS</span>
          </span>
        </Link>

        {navGroups.map((group) => (
          <section key={group.label} className="flex flex-col gap-1.5">
            <div className="px-1 font-mono text-[9px] uppercase tracking-[0.2em] text-bl-bone-4">
              {group.label}
            </div>
            <nav className="flex flex-col gap-px">
              {group.items.map((item) => {
                const className =
                  item.href === "/dashboard"
                    ? "flex items-center gap-2 rounded-[var(--radius-bl)] border border-bl-line bg-bl-panel px-2.5 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-bl-bone shadow-[inset_2px_0_0_var(--bl-alarm)]"
                    : "flex items-center gap-2 rounded-[var(--radius-bl)] border border-transparent px-2.5 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-bl-bone-2 hover:bg-bl-panel hover:text-bl-bone";

                return item.enabled ? (
                  <Link href={item.href} key={item.label} className={className}>
                    <Terminal size={14} aria-hidden="true" />
                    {item.label}
                  </Link>
                ) : (
                  <span key={item.label} className={`${className} cursor-not-allowed opacity-55`}>
                    <Terminal size={14} aria-hidden="true" />
                    {item.label}
                  </span>
                );
              })}
            </nav>
          </section>
        ))}

        <section className="mt-auto flex flex-col gap-1.5">
          <div className="px-1 font-mono text-[9px] uppercase tracking-[0.2em] text-bl-bone-4">
            // targets · live
          </div>
          <div className="flex items-center gap-2 rounded-[var(--radius-bl)] border border-bl-line bg-bl-graphite px-2.5 py-2">
            <span className="bl-live-dot" />
            <div>
              <div className="font-mono text-[11px] text-bl-bone">clinical-copilot</div>
              <div className="font-mono text-[9px] tracking-[0.06em] text-bl-bone-3">
                railway · configured
              </div>
            </div>
          </div>
          <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-bl-bone-4">
            BL_CONSOLE // dev
          </div>
        </section>
      </aside>

      <header className="fixed left-[232px] right-0 top-0 z-10 flex h-12 items-center justify-between border-b border-bl-line bg-[rgba(12,14,19,0.85)] px-5 backdrop-blur">
        <div className="flex items-center gap-2 font-mono text-[11px] text-bl-bone-3">
          <span>workspace</span>
          <span className="text-bl-bone-4">/</span>
          <span className="text-bl-bone">dashboard</span>
        </div>
        <div className="flex items-center gap-3">
          <Chip tone="signal">
            <Gauge size={12} aria-hidden="true" /> SHELL READY
          </Chip>
          <div className="flex h-7 w-[280px] items-center gap-2 rounded-[var(--radius-bl)] border border-bl-line bg-bl-trough px-2.5">
            <Search size={12} className="text-bl-bone-3" aria-hidden="true" />
            <Input
              aria-label="Search"
              placeholder="seed_id, run_id, sha..."
              className="h-auto border-0 bg-transparent p-0 text-[11px] focus:bg-transparent focus:[box-shadow:none]"
            />
          </div>
          <Button>
            <Activity size={12} aria-hidden="true" /> Run
          </Button>
        </div>
      </header>

      <div className="min-h-screen pl-[256px] pr-6 pt-[72px]">{children}</div>
    </main>
  );
}
