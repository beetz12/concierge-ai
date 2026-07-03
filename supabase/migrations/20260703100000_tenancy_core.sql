-- Multi-tenancy core: organizations, membership, tenant settings,
-- usage metering, and subscription state (SaaS slice 5).
--
-- Forward-compatibility notes (slice 6, docs/compliance/product-requirements.md):
-- the consent/authorization (R-1, R-2), suppression (R-9), A2P registration
-- (R-18), attestation (R-19), and audit-log (R-24) tables land in slice 6 and
-- will reference organizations(id) via org_id. tenant_settings below carries
-- the per-tenant caller identity / disclosure / voicemail fields those
-- requirements name (R-12 disclosure block, R-15/R-17 caller identity), and
-- the R-27 task_type taxonomy lookup table will live alongside these without
-- schema conflicts (no task_type column is claimed here).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (org_id, user_id)
);

CREATE TABLE tenant_settings (
  org_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  -- Identity presented on outbound calls (R-12 disclosure item 1, R-17 CNAM).
  caller_display_name TEXT,
  -- E.164 callback number disclosed on calls (R-12).
  callback_number TEXT,
  -- Rendered disclosure block toggles (R-12: identity, AI, recording).
  disclosure_config JSONB NOT NULL DEFAULT
    '{"identity_disclosure": true, "ai_disclosure": true, "recording_disclosure": true}'::jsonb,
  -- Matches VoicemailPolicy in apps/api/src/services/call-backend/types.ts.
  default_voicemail_policy TEXT NOT NULL DEFAULT 'hang_up'
    CHECK (default_voicemail_policy IN ('leave_message', 'hang_up', 'retry_later')),
  -- Placeholder for the tenant's provisioned DID (R-15/R-16); provisioning is
  -- a later slice, the column exists so dispatch can read it per-tenant.
  from_number TEXT,
  -- Per-tenant kill switch: when true, all outbound dispatch for the org is
  -- blocked by the policy layer.
  outbound_kill_switch BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('call_minutes', 'call_count', 'sms_count')),
  quantity NUMERIC NOT NULL CHECK (quantity >= 0),
  -- Loose reference: voice_call_sessions.id or a backend call id. No FK so
  -- usage rows survive call-session cleanup and non-session backends.
  call_id TEXT,
  occurred_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  plan TEXT NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter', 'pro')),
  status TEXT NOT NULL DEFAULT 'incomplete' CHECK (status IN (
    'incomplete', 'incomplete_expired', 'trialing', 'active',
    'past_due', 'canceled', 'unpaid', 'paused'
  )),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_organization_members_user_id ON organization_members(user_id);
CREATE INDEX idx_organization_members_org_id ON organization_members(org_id);
CREATE INDEX idx_usage_events_org_occurred ON usage_events(org_id, occurred_at DESC);
CREATE INDEX idx_usage_events_call_id ON usage_events(call_id) WHERE call_id IS NOT NULL;

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tenant_settings_updated_at
  BEFORE UPDATE ON tenant_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Membership helpers
--
-- auth.uid() is the verified JWT `sub` claim; membership is resolved against
-- organization_members. SECURITY DEFINER (functions run as the table owner,
-- which bypasses RLS) so that policies on organization_members itself can call
-- them without infinite recursion.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_org_member(target_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.org_id = target_org_id
      AND m.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(target_org_id UUID, allowed_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.org_id = target_org_id
      AND m.user_id = auth.uid()
      AND m.role = ANY (allowed_roles)
  );
$$;

-- ---------------------------------------------------------------------------
-- Org bootstrap: creating an organization makes the creator its owner and
-- provisions default tenant settings. SECURITY DEFINER so the inserts run as
-- the table owner (the creator is not yet a member when the trigger fires).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_organization()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO public.organization_members (org_id, user_id, role)
    VALUES (NEW.id, NEW.created_by, 'owner')
    ON CONFLICT (org_id, user_id) DO NOTHING;
  END IF;

  INSERT INTO public.tenant_settings (org_id)
  VALUES (NEW.id)
  ON CONFLICT (org_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_organization_created
  AFTER INSERT ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_organization();

-- Org creation entry point for clients. A plain INSERT ... RETURNING would
-- fail the SELECT policy because the membership trigger fires after RETURNING
-- is evaluated; this SECURITY DEFINER function returns the new row directly.
CREATE OR REPLACE FUNCTION public.create_organization(org_name TEXT)
RETURNS public.organizations
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org public.organizations;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'create_organization requires an authenticated user';
  END IF;

  INSERT INTO public.organizations (name, created_by)
  VALUES (org_name, auth.uid())
  RETURNING * INTO new_org;

  RETURN new_org;
END;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- organizations: tenant key is the row id itself.
CREATE POLICY organizations_tenant_select ON organizations
  FOR SELECT USING (public.is_org_member(id));

CREATE POLICY organizations_tenant_insert ON organizations
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND created_by = auth.uid());

CREATE POLICY organizations_tenant_update ON organizations
  FOR UPDATE USING (public.has_org_role(id, ARRAY['owner', 'admin']))
  WITH CHECK (public.has_org_role(id, ARRAY['owner', 'admin']));

CREATE POLICY organizations_tenant_delete ON organizations
  FOR DELETE USING (public.has_org_role(id, ARRAY['owner']));

-- organization_members: members can see their org's roster; only owners and
-- admins manage it (the bootstrap trigger inserts the first owner as table
-- owner, bypassing these policies).
CREATE POLICY organization_members_tenant_select ON organization_members
  FOR SELECT USING (public.is_org_member(org_id));

CREATE POLICY organization_members_tenant_insert ON organization_members
  FOR INSERT WITH CHECK (public.has_org_role(org_id, ARRAY['owner', 'admin']));

CREATE POLICY organization_members_tenant_update ON organization_members
  FOR UPDATE USING (public.has_org_role(org_id, ARRAY['owner', 'admin']))
  WITH CHECK (public.has_org_role(org_id, ARRAY['owner', 'admin']));

CREATE POLICY organization_members_tenant_delete ON organization_members
  FOR DELETE USING (
    public.has_org_role(org_id, ARRAY['owner', 'admin'])
    OR user_id = auth.uid()
  );

-- tenant_settings
CREATE POLICY tenant_settings_tenant_select ON tenant_settings
  FOR SELECT USING (public.is_org_member(org_id));

CREATE POLICY tenant_settings_tenant_insert ON tenant_settings
  FOR INSERT WITH CHECK (public.has_org_role(org_id, ARRAY['owner', 'admin']));

CREATE POLICY tenant_settings_tenant_update ON tenant_settings
  FOR UPDATE USING (public.has_org_role(org_id, ARRAY['owner', 'admin']))
  WITH CHECK (public.has_org_role(org_id, ARRAY['owner', 'admin']));

CREATE POLICY tenant_settings_tenant_delete ON tenant_settings
  FOR DELETE USING (public.has_org_role(org_id, ARRAY['owner']));

-- usage_events: members may read their org's metering; rows are written only
-- by the API's recordUsage() via the service role (bypasses RLS) so tenants
-- cannot forge usage. The immutable-ledger write policies are deliberately
-- `false` for user contexts.
CREATE POLICY usage_events_tenant_select ON usage_events
  FOR SELECT USING (public.is_org_member(org_id));

CREATE POLICY usage_events_tenant_insert ON usage_events
  FOR INSERT WITH CHECK (false);

CREATE POLICY usage_events_tenant_update ON usage_events
  FOR UPDATE USING (false);

CREATE POLICY usage_events_tenant_delete ON usage_events
  FOR DELETE USING (false);

-- subscriptions: members may read their org's subscription; lifecycle writes
-- come only from the Stripe webhook via the service role (bypasses RLS).
CREATE POLICY subscriptions_tenant_select ON subscriptions
  FOR SELECT USING (public.is_org_member(org_id));

CREATE POLICY subscriptions_tenant_insert ON subscriptions
  FOR INSERT WITH CHECK (false);

CREATE POLICY subscriptions_tenant_update ON subscriptions
  FOR UPDATE USING (false);

CREATE POLICY subscriptions_tenant_delete ON subscriptions
  FOR DELETE USING (false);

COMMENT ON TABLE organizations IS
  'Tenant root. All tenant-scoped tables carry org_id referencing this table.';
COMMENT ON TABLE organization_members IS
  'Org membership with role owner/admin/member; drives all RLS tenancy checks.';
COMMENT ON TABLE tenant_settings IS
  'Per-tenant call identity, disclosure, voicemail, from-number, and kill-switch config.';
COMMENT ON TABLE usage_events IS
  'Append-only usage metering ledger (call minutes/counts, SMS counts) per org.';
COMMENT ON TABLE subscriptions IS
  'Stripe subscription state per org (placeholder plans starter/pro).';
