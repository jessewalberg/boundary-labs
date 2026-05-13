BEGIN;

CREATE INDEX IF NOT EXISTS idx_seed_versions_seed_id ON seed_versions(seed_id, version);
CREATE INDEX IF NOT EXISTS idx_policy_values_domain ON policy_values(domain);

COMMIT;
