import Link from "next/link";
import { Button } from "@/components/ui/button";

export function BreadcrumbBack({ href, label }: { href: string; label: string }) {
  return (
    <Button asChild variant="ghost" size="sm">
      <Link href={href}>← {label}</Link>
    </Button>
  );
}
