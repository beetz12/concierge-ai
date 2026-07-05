-- Membership backend: per-org dedicated outbound number + per-org call
-- settings (goal: membership-api).
--
-- Durable subscription status note: org-level Stripe lifecycle state already
-- lives in public.subscriptions (20260703100000_tenancy_core.sql, org_id
-- UNIQUE, columns stripe_customer_id / plan / status / updated_at) and is
-- maintained by the billing webhook
-- (apps/api/src/services/billing/webhook.ts) on checkout.session.completed
-- and customer.subscription.created/updated/deleted. The membership routes
-- read subscription state from that table, so no duplicate subscription
-- columns are added to organizations here.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One dedicated outbound caller-id number per organization.
-- status lifecycle: 'simulated' (purchase gate off — deterministic fake
-- number, no money spent), 'active' (real Retell number purchased while
-- RETELL_NUMBER_PURCHASE_ENABLED=true), 'released' (number given back).
CREATE TABLE org_phone_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  phone_e164 TEXT NOT NULL,
  -- Retell-side identifier for the purchased number (Retell keys numbers by
  -- their E.164 string); NULL for simulated numbers.
  retell_number_ref TEXT,
  status TEXT NOT NULL CHECK (status IN ('simulated', 'active', 'released')),
  area_code TEXT,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at TIMESTAMPTZ
);

-- A number can only be held by one org at a time (released numbers may be
-- re-issued later).
CREATE UNIQUE INDEX idx_org_phone_numbers_phone_active
  ON org_phone_numbers(phone_e164)
  WHERE status <> 'released';

-- Per-org outbound call defaults applied when a dispatch plan does not
-- specify them (see apps/api/src/routes/dispatch.ts).
CREATE TABLE org_call_settings (
  org_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  caller_identity TEXT,
  -- Matches VoicemailPolicy in apps/api/src/services/call-backend/types.ts.
  voicemail_policy TEXT NOT NULL DEFAULT 'hang_up'
    CHECK (voicemail_policy IN ('leave_message', 'hang_up', 'retry_later')),
  transfer_number TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_org_call_settings_updated_at
  BEFORE UPDATE ON org_call_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Org members may read their own org's rows; all writes go through the API's
-- service role (bypasses RLS) so tenants cannot forge numbers or settings.
-- ---------------------------------------------------------------------------

ALTER TABLE org_phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_call_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_phone_numbers_tenant_select ON org_phone_numbers
  FOR SELECT USING (public.is_org_member(org_id));

CREATE POLICY org_phone_numbers_tenant_insert ON org_phone_numbers
  FOR INSERT WITH CHECK (false);

CREATE POLICY org_phone_numbers_tenant_update ON org_phone_numbers
  FOR UPDATE USING (false);

CREATE POLICY org_phone_numbers_tenant_delete ON org_phone_numbers
  FOR DELETE USING (false);

CREATE POLICY org_call_settings_tenant_select ON org_call_settings
  FOR SELECT USING (public.is_org_member(org_id));

CREATE POLICY org_call_settings_tenant_insert ON org_call_settings
  FOR INSERT WITH CHECK (false);

CREATE POLICY org_call_settings_tenant_update ON org_call_settings
  FOR UPDATE USING (false);

CREATE POLICY org_call_settings_tenant_delete ON org_call_settings
  FOR DELETE USING (false);

COMMENT ON TABLE org_phone_numbers IS
  'Per-org dedicated Retell outbound caller-id number (simulated/active/released).';
COMMENT ON TABLE org_call_settings IS
  'Per-org outbound call defaults: caller identity, voicemail policy, transfer number.';
