"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bot,
  Crosshair,
  FileWarning,
  Gauge,
  History,
  KeyRound,
  Radar,
  Search,
  ShieldCheck,
  Terminal
} from "lucide-react";
import { Chip } from "@/components/boundary/chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const navGroups = [
  {
    label: "// workspace",
    items: [
      { label: "Dashboard", href: "/dashboard", enabled: true, icon: Gauge },
      { label: "Runs", href: "/campaigns", enabled: true, icon: History },
      { label: "Seeds", href: "/seeds", enabled: true, icon: Crosshair, count: 5 },
      { label: "Agents", href: "/agents", enabled: true, icon: Bot, count: 5 },
      { label: "Judges", href: "/judges", enabled: true, icon: ShieldCheck }
    ]
  },
  {
    label: "// review",
    items: [
      { label: "Threat Model", href: "/threat-model", enabled: true, icon: FileWarning },
      { label: "Coverage", href: "/coverage", enabled: true, icon: Radar },
      { label: "Findings", href: "/findings", enabled: true, icon: Terminal, count: 4 }
    ]
  },
  {
    label: "// system",
    items: [
      { label: "Targets", href: "/targets", enabled: true, icon: Crosshair },
      { label: "Secrets", href: "/secrets", enabled: true, icon: KeyRound },
      { label: "Schedule", href: "/schedule", enabled: true, icon: History }
    ]
  }
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const crumb = breadcrumbFor(pathname);

  return (
    <main className="min-h-screen bg-bl-graphite text-bl-bone">
      <aside className="fixed inset-y-0 left-0 hidden w-[232px] flex-col gap-3 border-r border-bl-line bg-bl-void px-3 py-4 lg:flex">
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
                const Icon = item.icon;
                const active =
                  item.href === "/dashboard"
                    ? pathname === "/dashboard"
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
                const className =
                  active
                    ? "flex items-center gap-2 rounded-[var(--radius-bl)] border border-bl-line bg-bl-panel px-2.5 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-bl-bone shadow-[inset_2px_0_0_var(--bl-alarm)]"
                    : "flex items-center gap-2 rounded-[var(--radius-bl)] border border-transparent px-2.5 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-bl-bone-2 hover:bg-bl-panel hover:text-bl-bone";

                return item.enabled ? (
                  <Link href={item.href} key={item.label} className={className}>
                    <Icon size={14} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {"count" in item && item.count != null ? (
                      <span className="rounded-[var(--radius-bl)] border border-bl-line bg-bl-trough px-1.5 py-px text-[9px] text-bl-bone-3">
                        {item.count}
                      </span>
                    ) : null}
                  </Link>
                ) : (
                  <span key={item.label} className={`${className} cursor-not-allowed opacity-55`}>
                    <Icon size={14} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {"count" in item && item.count != null ? (
                      <span className="rounded-[var(--radius-bl)] border border-bl-line bg-bl-trough px-1.5 py-px text-[9px] text-bl-bone-3">
                        {item.count}
                      </span>
                    ) : null}
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
                railway · /readyz ok
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-[var(--radius-bl)] border border-bl-line bg-bl-graphite px-2.5 py-2 opacity-70">
            <span className="h-2 w-2 rounded-full bg-bl-bone-4" />
            <div>
              <div className="font-mono text-[11px] text-bl-bone">localhost:8400</div>
              <div className="font-mono text-[9px] tracking-[0.06em] text-bl-bone-3">
                dev · offline
              </div>
            </div>
          </div>
          <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-bl-bone-4">
            BL_HARNESS // v0.3.1
          </div>
          <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-bl-bone-4">
            session 2.h41m
          </div>
        </section>
      </aside>

      <header className="fixed left-0 right-0 top-0 z-10 flex h-12 items-center justify-between border-b border-bl-line bg-[rgba(12,14,19,0.85)] px-3 backdrop-blur lg:left-[232px] lg:px-5">
        <div className="flex items-center gap-2 font-mono text-[11px] text-bl-bone-3">
          <span className="font-semibold text-bl-bone lg:hidden">BOUNDARY</span>
          <span className="text-bl-bone-4 lg:hidden">/</span>
          <span>workspace</span>
          <span className="text-bl-bone-4">/</span>
          <span className="text-bl-bone">{crumb}</span>
        </div>
        <div className="flex items-center gap-3">
          <Chip tone="signal" className="hidden sm:inline-flex">
            <Gauge size={12} aria-hidden="true" /> HARNESS LIVE · 4 / 4 OK
          </Chip>
          <div className="hidden h-7 w-[280px] items-center gap-2 rounded-[var(--radius-bl)] border border-bl-line bg-bl-trough px-2.5 md:flex">
            <Search size={12} className="text-bl-bone-3" aria-hidden="true" />
            <Input
              aria-label="Search"
              placeholder="seed_id, run_id, sha..."
              className="h-auto border-0 bg-transparent p-0 text-[11px] focus:bg-transparent focus:[box-shadow:none]"
            />
          </div>
          <Button>
            <Activity size={12} aria-hidden="true" /> Run
            <span className="ml-1 border border-bl-line-2 px-1 font-mono text-[10px] text-bl-bone-3">Enter</span>
          </Button>
        </div>
      </header>

      <div className="min-h-screen px-4 pt-[72px] lg:pl-[256px] lg:pr-6">{children}</div>
    </main>
  );
}

function breadcrumbFor(pathname: string) {
  if (pathname.startsWith("/campaigns")) {
    if (pathname === "/campaigns/new") return "runs / new";
    if (pathname === "/campaigns") return "runs";
    if (pathname.includes("/seeds/")) return "runs / seed";
    return "runs / detail";
  }

  const labels: Record<string, string> = {
    "/dashboard": "dashboard",
    "/seeds": "seeds",
    "/agents": "agents",
    "/judges": "judges",
    "/threat-model": "threat model",
    "/coverage": "coverage",
    "/findings": "findings",
    "/targets": "targets",
    "/secrets": "secrets",
    "/schedule": "schedule"
  };

  return labels[pathname] ?? (pathname.replace(/^\//, "") || "dashboard");
}
