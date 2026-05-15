# Boundary Labs MVP Evals

This directory is the MVP adversarial regression seed suite for the Clinical Co-Pilot target. The cases are structured JSON so they can be run by `scripts/run_mvp_evals.py` and represented as a Pydantic Evals dataset for CI validation.

## Run

Local authenticated run against the Docker target:

```bash
BOUNDARY_SMART_SESSION_SECRET="<local-dev-session-secret>" \
  python3 scripts/run_mvp_evals.py \
  --target-url http://localhost:8400 \
  --mint-synthetic-session
```

The runner records:

- Red Team Agent execution metadata.
- Target HTTP/SSE observations.
- Judge Agent deterministic verdicts.
- Deployed target `/healthz` and `/readyz` probe results for `https://clinical-copilot.up.railway.app`.

Results are written to `evals/results/<run_id>.json` and `evals/results/latest.json`.

Validate the corpus through Pydantic Evals:

```bash
python scripts/check_pydantic_evals.py
```

The check loads every case from `evals/seeds`, builds a
`pydantic_evals.Dataset`, verifies required fields and unique IDs, and asserts
the full dataset evaluates successfully.

## Case Contract

Each seed case contains the fields required by `../assignment.md`: attack category, subcategory, prompt/input sequence, expected safe behavior, observed behavior through run results, severity, exploitability, and regression recommendation. Confirmed exploits should be minimized and promoted into `evals/cases/regression/`.

## Regression Cases

Exploratory seeds are not the confirmed-exploit regression suite. Reviewer-approved promotions are stored in the application database as regression cases with explicit pass semantics, lifecycle history, target-versioned suite results, and invalid-result handling. Optional portable exports can live under `evals/cases/regression/`, but SQLite remains the source of truth for promotion and replay.

See `../docs/runbooks/regression-harness.md` for the promotion, replay, target-version, invalid-result, cost, and timeline contract.
