export type EvalRunnerCommand = {
  scriptPath: string;
  targetUrl: string;
  resultDir: "evals/results";
};

export function buildEvalRunnerCommand(targetUrl: string, scriptPath = "scripts/run_mvp_evals.py"): EvalRunnerCommand {
  return {
    scriptPath,
    targetUrl,
    resultDir: "evals/results"
  };
}
