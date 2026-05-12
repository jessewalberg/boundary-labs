# Boundary Labs

Boundary Labs is the Week 3 adversarial evaluation workspace for the OpenEMR Clinical Co-Pilot. It is a separate security app/harness that targets the Clinical Co-Pilot over authorized HTTP/SSE interfaces instead of importing target code.

## MVP Status

MVP hard gates covered in this repo:

- `THREAT_MODEL.md` maps the Clinical Co-Pilot attack surface and begins with the required executive summary.
- `ARCHITECTURE.md` defines the multi-agent platform architecture and agent responsibilities.
- `evals/` contains structured adversarial seeds across prompt injection, authorization/data exposure, and tool misuse.
- `scripts/run_mvp_evals.py` prototypes Red Team and Judge roles against a live target and writes reproducible results.
- `evals/results/latest.json` contains the latest live run artifact.

Latest recorded run:

- Run ID: `mvp-20260512-204402`
- Target exercised: `https://clinical-copilot.up.railway.app`
- Result: 4 total, 4 pass, 0 fail, 0 partial, 0 invalid
- Deployed Co-Pilot URL: `https://clinical-copilot.up.railway.app`
- Deployed Co-Pilot `/healthz`: ok
- Deployed Co-Pilot `/readyz`: ok with FHIR, audit, LLM, and ingest polling checks passing

## Target URLs

Local target stack:

- OpenEMR: `http://localhost:8300`
- Clinical Co-Pilot: `http://localhost:8400`
- Co-Pilot liveness: `http://localhost:8400/healthz`
- Co-Pilot readiness: `http://localhost:8400/readyz`

Deployed target:

- Clinical Co-Pilot: `https://clinical-copilot.up.railway.app`
- OpenEMR service reported by Railway: `https://everybody-loves-healthcare.up.railway.app`

Deployment changes made to bring the target into a testable MVP state:

- Updated the deployed Clinical Co-Pilot server-to-server OpenEMR URLs to use Railway private networking:
  `http://everybody-loves-healthcare.railway.internal/apis/default`.
- Deployed the Clinical Co-Pilot subdirectory with the readiness timeout fix so `/readyz` uses
  `OPENEMR_FHIR_TIMEOUT_SECONDS` instead of the old hard-coded 1.5 second FHIR metadata timeout.
- Left browser/OAuth-facing URLs public so SMART launch still uses `https://everybody-loves-healthcare.up.railway.app`.

## Run The MVP Evals

Preferred authenticated path: launch Clinical Co-Pilot from OpenEMR, copy the `copilot_smart_session` cookie from the browser, then run:

```bash
python3 scripts/run_mvp_evals.py \
  --target-url http://localhost:8400 \
  --smart-session-cookie "$TARGET_SMART_SESSION_COOKIE"
```

Deployed MVP artifact path: `evals/results/mvp-20260512-204402.json`. The deployed run minted a synthetic SMART cookie inside `railway run` using the deployed `SESSION_SECRET`; the secret was not printed or written to the artifact.

Local fallback for development: mint a synthetic SMART cookie using the local dev session secret. This is acceptable only for local synthetic testing because it couples the runner to the target's dev secret and does not provide a real OpenEMR access token.

```bash
BOUNDARY_SMART_SESSION_SECRET="<local-dev-session-secret>" \
  python3 scripts/run_mvp_evals.py \
  --target-url http://localhost:8400 \
  --mint-synthetic-session \
  --timeout-seconds 45
```

The runner writes `evals/results/<run_id>.json` and updates `evals/results/latest.json`.

## Target Setup

From the OpenEMR fork checkout:

```bash
cd docker/development-easy
docker compose up -d

cd ../..
docker compose -f docker/development-easy/docker-compose.yml \
  -f clinical-copilot/docker-compose.override.yml \
  up --build -d clinical-copilot
```

Verify:

```bash
curl -sS http://localhost:8400/healthz
curl -sS http://localhost:8400/readyz
```

## MVP Scope Boundaries

- Synthetic data only.
- Authorized local/deployed targets only.
- The security runner does not import target app modules.
- Direct `/conversation` evals are implemented now.
- Uploaded-document indirect injection is seeded in the threat model but deferred until the Target Adapter has a browser upload path or an approved ingest test seam.
- Tool-misuse judging is semantic until the target exposes authorized tool traces across the separation boundary.
