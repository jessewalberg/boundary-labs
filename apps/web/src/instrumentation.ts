export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { runWebStartupRecoverySweep } = await import("@/server/recovery/web-startup-sweep");
  const { sweepArtifactIngest } = await import("@/server/ingest/sweep");
  runWebStartupRecoverySweep();
  sweepArtifactIngest();
}
