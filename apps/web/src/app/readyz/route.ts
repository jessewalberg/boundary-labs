import { ensureLocalStatePaths } from "@/server/storage/paths";
import { getBoundaryConfig } from "@/server/config";

export function GET() {
  const config = getBoundaryConfig();
  const paths = ensureLocalStatePaths();

  return Response.json({
    status: "ok",
    service: "boundary-web",
    checks: {
      app: "ok",
      sqliteDirectory: paths.sqliteDir,
      artifactDirectory: paths.artifactDir,
      targetUrl: config.targetUrl,
      targetAllowlistCount: config.targetAllowlist.length,
      evalRunnerPath: config.evalRunnerPath,
      dataMode: config.dataMode
    }
  });
}
