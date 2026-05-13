import { redirect } from "next/navigation";
import { Chip } from "@/components/boundary/chip";
import { Panel } from "@/components/boundary/panel";
import { getSession } from "@/server/auth/session";
import { getBoundaryConfig } from "@/server/config";
import { LoginButtons } from "./login-buttons";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  const config = getBoundaryConfig();

  return (
    <main className="grid min-h-screen place-items-center bg-bl-graphite px-4 text-bl-bone">
      <section className="w-full max-w-[420px]">
        <div className="mb-5 flex items-center gap-2">
          <img src="/brand/logo-mark.svg" alt="" className="h-6 w-6" />
          <span className="font-mono text-sm font-semibold">
            BOUNDARY <span className="font-normal text-bl-bone-3">LABS</span>
          </span>
        </div>
        <Panel watermark="// authenticated console" right={<Chip tone="signal">RBAC</Chip>}>
          <h1 className="m-0 font-mono text-2xl uppercase tracking-[0.06em]">Sign in</h1>
          <p className="mb-5 mt-3 text-sm leading-6 text-bl-bone-2">
            Access is limited to allowlisted operators. Revoked accounts remain tombstoned.
          </p>
          <LoginButtons />
          <div className="mt-5 border-t border-bl-line pt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-bl-bone-4">
            owner · {config.ownerEmail ?? "not configured"}
          </div>
        </Panel>
      </section>
    </main>
  );
}
