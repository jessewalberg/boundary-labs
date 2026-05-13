export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { sweepArtifactIngest } = await import("@/server/ingest/sweep");
  sweepArtifactIngest();
}
