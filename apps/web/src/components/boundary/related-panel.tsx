import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Chip } from "@/components/boundary/chip";
import { Panel } from "@/components/boundary/panel";

export type RelatedLink = {
  label: string;
  href: string;
  meta?: string;
};

export function RelatedPanel({ links }: { links: RelatedLink[] }) {
  return (
    <Panel watermark="// related" right={<Chip>{links.length} links</Chip>} padded={false}>
      {links.length > 0 ? (
        links.map((link) => (
          <Link
            key={`${link.href}-${link.label}`}
            href={link.href}
            className="flex items-center gap-3 border-b border-bl-line px-4 py-3 text-sm text-bl-bone-2 transition-colors hover:bg-bl-panel-2 hover:text-bl-bone last:border-b-0"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono text-xs text-bl-bone">{link.label}</span>
              {link.meta ? <span className="mt-1 block truncate font-mono text-[10px] text-bl-bone-4">{link.meta}</span> : null}
            </span>
            <ArrowRight size={12} className="text-bl-bone-3" aria-hidden="true" />
          </Link>
        ))
      ) : (
        <div className="px-4 py-6 text-sm text-bl-bone-3">No related entities yet.</div>
      )}
    </Panel>
  );
}
