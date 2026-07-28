-- 0070_tenant_library_subscriptions
--
-- Opt-in standards-library subscription (S1b-1). A tenant subscribes to a library
-- partition (e.g. 'library:standards'); retrieval for that tenant then UNIONS the
-- subscribed library partitions into its query set alongside its own tenant_id.
--
-- This is the ONLY sanctioned cross-tenant read: explicit, opt-in, per-subscription.
-- There is NO wildcard and NO "missing row means all" rule — an absent subscription
-- means the tenant reads only its own partition. Losing a subscription is the safe
-- failure; gaining one requires an explicit row here.
--
-- Append-only per the D1 rules; no rows are seeded — subscription happens at onboarding
-- (a later slice), never here.

CREATE TABLE IF NOT EXISTS tenant_library_subscriptions (
  tenant_id         TEXT NOT NULL,   -- the subscriber
  library_tenant_id TEXT NOT NULL,   -- the library partition they may read (e.g. 'library:standards')
  subscribed_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (tenant_id, library_tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_tls_tenant ON tenant_library_subscriptions(tenant_id);
