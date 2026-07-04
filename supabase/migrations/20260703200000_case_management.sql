-- Case management (SaaS slice 7): long-running dispute / follow-up cases and
-- their interaction timeline.
--
-- Model notes: the schema ports the dispute-resolution playbook model --
-- escalation stages 1-4 (collaborative -> firm professional -> reference
-- consequences -> ultimatum), a dispute log status lifecycle, leverage notes,
-- amount at stake, and a chronological event ledger (calls, SMS, email,
-- notes, status changes, evidence) whose payload carries call/message refs
-- and named promises for follow-up call context.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  -- Counterparty: the person/company on the other side of the dispute.
  counterparty_name TEXT,
  counterparty_company TEXT,
  counterparty_phone TEXT,
  counterparty_email TEXT,
  dispute_type TEXT NOT NULL DEFAULT 'other' CHECK (dispute_type IN (
    'contractor', 'delivery', 'insurance', 'service', 'retail', 'property', 'other'
  )),
  -- Progressive escalation framework: 1 collaborative, 2 firm professional,
  -- 3 reference consequences, 4 ultimatum. Transitions are monotonic at the
  -- API layer unless explicitly overridden.
  escalation_stage SMALLINT NOT NULL DEFAULT 1
    CHECK (escalation_stage BETWEEN 1 AND 4),
  amount_at_stake NUMERIC CHECK (amount_at_stake IS NULL OR amount_at_stake >= 0),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
    'open', 'pending_response', 'escalated', 'resolved', 'closed'
  )),
  -- Leverage assessment (payment withheld, chargeback available, evidence...).
  leverage_notes TEXT,
  -- When the next follow-up action is due; NULL = nothing scheduled.
  next_action_at TIMESTAMPTZ,
  resolution TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE case_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  -- Denormalized tenant key so RLS never needs a join.
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (
    'call', 'sms', 'email', 'note', 'status_change', 'evidence'
  )),
  occurred_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  summary TEXT NOT NULL,
  -- Structured refs: { call_id, message_id, direction, rep_name,
  --   promises: [{ who, what, due_date }], from_stage, to_stage, ... }
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_cases_org_id ON cases(org_id);
CREATE INDEX idx_cases_org_next_action
  ON cases(org_id, next_action_at) WHERE next_action_at IS NOT NULL;
CREATE INDEX idx_case_events_case_occurred ON case_events(case_id, occurred_at);
CREATE INDEX idx_case_events_org_id ON case_events(org_id);

CREATE TRIGGER update_cases_updated_at
  BEFORE UPDATE ON cases
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Row Level Security (slice 5 conventions: org membership via the
-- SECURITY DEFINER helpers, WITH CHECK on writes, policy names
-- <table>_tenant_<op>).
-- ---------------------------------------------------------------------------

ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY cases_tenant_select ON cases
  FOR SELECT USING (public.is_org_member(org_id));
CREATE POLICY cases_tenant_insert ON cases
  FOR INSERT WITH CHECK (public.is_org_member(org_id));
CREATE POLICY cases_tenant_update ON cases
  FOR UPDATE USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));
CREATE POLICY cases_tenant_delete ON cases
  FOR DELETE USING (public.has_org_role(org_id, ARRAY['owner', 'admin']));

CREATE POLICY case_events_tenant_select ON case_events
  FOR SELECT USING (public.is_org_member(org_id));
CREATE POLICY case_events_tenant_insert ON case_events
  FOR INSERT WITH CHECK (
    public.is_org_member(org_id)
    AND EXISTS (
      SELECT 1 FROM cases c
      WHERE c.id = case_id AND c.org_id = case_events.org_id
    )
  );
CREATE POLICY case_events_tenant_update ON case_events
  FOR UPDATE USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));
CREATE POLICY case_events_tenant_delete ON case_events
  FOR DELETE USING (public.has_org_role(org_id, ARRAY['owner', 'admin']));

COMMENT ON TABLE cases IS
  'Dispute / follow-up cases per org: counterparty, dispute type, escalation stage 1-4, status lifecycle, leverage notes, next scheduled action.';
COMMENT ON TABLE case_events IS
  'Append-mostly case timeline: calls, SMS, email, notes, status changes, evidence; payload carries call/message refs and named promises.';
COMMENT ON COLUMN cases.escalation_stage IS
  '1 collaborative, 2 firm professional, 3 reference consequences, 4 ultimatum; monotonic unless override.';
