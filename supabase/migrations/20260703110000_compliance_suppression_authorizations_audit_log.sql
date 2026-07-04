-- Compliance engine tables (SaaS slice 6, docs/compliance/product-requirements.md):
-- suppression list (R-9), call authorizations (R-1), and the per-dispatch
-- audit log (R-24/R-25). All org-scoped with slice-5 RLS conventions:
-- <table>_tenant_* policy names, WITH CHECK on writes, is_org_member()/
-- has_org_role() helpers from 20260703100000_tenancy_core.sql.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- R-9: numbers that must never be dialed/texted. org_id NULL = platform-wide
-- entry (managed by the service role only); otherwise tenant-scoped. The
-- engine checks both scopes by E.164 before every dispatch (R-10).
CREATE TABLE suppression_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL CHECK (phone_number ~ '^\+1[0-9]{10}$'),
  reason TEXT NOT NULL DEFAULT 'manual' CHECK (reason IN (
    'recipient_optout', 'internal_dnc', 'litigator_scrub', 'national_dnc', 'manual'
  )),
  -- Loose reference to the call that triggered the entry (R-4 opt-out intake).
  source_call_id TEXT,
  added_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  -- NULL = never expires. Internal-DNC entries are retained >= 5 years
  -- (47 CFR 64.1200(d)(6)); expiry is for scrub-sourced entries only.
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- R-1: immutable record that a human authorized a specific call plan.
-- Written only by the API (service role) at dispatch time; call_plan_hash is
-- a SHA-256 over the exact plan the approver saw.
CREATE TABLE call_authorizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  call_plan_hash TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'voice' CHECK (channel IN ('voice', 'sms')),
  approved_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- R-24/R-25: every dispatch attempt logs the full policy decision — allows
-- AND denies (with machine-readable reasons) — stamped with the policy
-- version that produced it. call_id is backfilled once the backend accepts
-- the call; deny rows keep it NULL.
CREATE TABLE dispatch_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('allow', 'deny')),
  reasons TEXT[] NOT NULL DEFAULT '{}',
  policy_version TEXT NOT NULL,
  target_number TEXT,
  task_type TEXT,
  channel TEXT NOT NULL DEFAULT 'voice' CHECK (channel IN ('voice', 'sms')),
  call_id TEXT,
  evaluated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_suppression_entries_phone ON suppression_entries(phone_number);
CREATE INDEX idx_suppression_entries_org
  ON suppression_entries(org_id) WHERE org_id IS NOT NULL;
CREATE INDEX idx_call_authorizations_org
  ON call_authorizations(org_id, approved_at DESC);
CREATE INDEX idx_dispatch_audit_log_org
  ON dispatch_audit_log(org_id, evaluated_at DESC);
CREATE INDEX idx_dispatch_audit_log_call_id
  ON dispatch_audit_log(call_id) WHERE call_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE suppression_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_audit_log ENABLE ROW LEVEL SECURITY;

-- suppression_entries: tenants see and manage their own list; platform-wide
-- rows (org_id IS NULL) are visible/writable only via the service role.
CREATE POLICY suppression_entries_tenant_select ON suppression_entries
  FOR SELECT USING (org_id IS NOT NULL AND public.is_org_member(org_id));

CREATE POLICY suppression_entries_tenant_insert ON suppression_entries
  FOR INSERT WITH CHECK (
    org_id IS NOT NULL AND public.has_org_role(org_id, ARRAY['owner', 'admin'])
  );

CREATE POLICY suppression_entries_tenant_update ON suppression_entries
  FOR UPDATE USING (
    org_id IS NOT NULL AND public.has_org_role(org_id, ARRAY['owner', 'admin'])
  )
  WITH CHECK (
    org_id IS NOT NULL AND public.has_org_role(org_id, ARRAY['owner', 'admin'])
  );

CREATE POLICY suppression_entries_tenant_delete ON suppression_entries
  FOR DELETE USING (
    org_id IS NOT NULL AND public.has_org_role(org_id, ARRAY['owner', 'admin'])
  );

-- call_authorizations: consent-proof ledger (usage_events pattern) — members
-- read their org's rows; writes come only from the API's service role so the
-- record cannot be forged or edited after the fact.
CREATE POLICY call_authorizations_tenant_select ON call_authorizations
  FOR SELECT USING (public.is_org_member(org_id));

CREATE POLICY call_authorizations_tenant_insert ON call_authorizations
  FOR INSERT WITH CHECK (false);

CREATE POLICY call_authorizations_tenant_update ON call_authorizations
  FOR UPDATE USING (false);

CREATE POLICY call_authorizations_tenant_delete ON call_authorizations
  FOR DELETE USING (false);

-- dispatch_audit_log: evidentiary ledger (usage_events pattern) — members
-- read their org's decisions (R-25 surfaces WHY a dispatch was denied);
-- writes come only from the API's service role.
CREATE POLICY dispatch_audit_log_tenant_select ON dispatch_audit_log
  FOR SELECT USING (public.is_org_member(org_id));

CREATE POLICY dispatch_audit_log_tenant_insert ON dispatch_audit_log
  FOR INSERT WITH CHECK (false);

CREATE POLICY dispatch_audit_log_tenant_update ON dispatch_audit_log
  FOR UPDATE USING (false);

CREATE POLICY dispatch_audit_log_tenant_delete ON dispatch_audit_log
  FOR DELETE USING (false);

COMMENT ON TABLE suppression_entries IS
  'Do-not-call suppression list (R-9): tenant-scoped rows plus platform-wide rows with org_id NULL; checked by E.164 before every dispatch.';
COMMENT ON TABLE call_authorizations IS
  'Immutable authorization spine (R-1): who approved which call plan (hash), when, on which channel. Service-role writes only.';
COMMENT ON TABLE dispatch_audit_log IS
  'Per-dispatch policy decisions (R-24/R-25): allow/deny with typed reasons and the policy version that produced them. Service-role writes only.';
