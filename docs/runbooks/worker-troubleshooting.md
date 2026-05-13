# Worker Troubleshooting Runbook

Use this when `/readyz` reports degraded worker health, campaigns remain queued, or a run looks orphaned after a restart.

## Fast Triage

1. Check readiness:

   ```bash
   curl -sS "$BETTER_AUTH_URL/readyz" | jq .
   ```

2. Check the worker heartbeat:

   ```bash
   stat /data/worker.heartbeat
   cat /data/worker.heartbeat
   ```

   A missing heartbeat means the worker has not started. A stale heartbeat means the process is running late, blocked, or dead while the web process remains alive.

3. Check supervised processes:

   ```bash
   supervisorctl -c /etc/supervisor/conf.d/boundary.conf status
   ```

   `web`, `worker`, and `exit-on-fatal` should all be `RUNNING`.

## Queue State

Inspect queued and claimed jobs:

```sql
SELECT id, campaign_id, status, claim_token, claimed_at, updated_at
FROM campaign_jobs
ORDER BY priority DESC, created_at ASC;
```

Claimed rows with a stale heartbeat are recovery candidates. Web startup recovery marks orphaned campaigns failed; worker recovery consumes completed or failed sentinels under `/data/artifacts/runs/<run_id>/`.

## Common Diagnoses

- `worker heartbeat has not been written yet`: worker did not boot, cannot import graph modules, or cannot open SQLite.
- `worker heartbeat is stale`: worker booted but stopped polling; inspect supervisor logs and long-running campaign artifacts.
- `graph_error` audit event: the worker claimed a job but the Pydantic Graph path failed.
- `claim_refused_operator_revoked`: the worker rechecked the submitting operator and released the claim.
- `red_team_cap_exceeded`: Safety Gate refused more pending Red Team mutations for that category.

## Manual Drain

Only drain jobs after preserving logs and artifacts.

```sql
UPDATE campaign_jobs
SET status = 'failed', claim_token = NULL, claimed_at = NULL, updated_at = datetime('now')
WHERE status = 'claimed';
```

Then restart the container so web startup recovery and artifact ingest run from a clean process tree.

## Logs And Artifacts

- Worker heartbeat: `/data/worker.heartbeat`
- SQLite database: `/data/boundary.db`
- Run artifacts: `/data/artifacts/runs/<run_id>/`
- Supervisor config: `/etc/supervisor/conf.d/boundary.conf`
