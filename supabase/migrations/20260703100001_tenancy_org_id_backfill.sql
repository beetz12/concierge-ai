-- Tenancy rollout for pre-existing tables: every tenant-scoped table gains
-- org_id, existing rows are backfilled into a single legacy org, and the old
-- per-user RLS policies are replaced with org-membership policies
-- (<table>_tenant_select/insert/update/delete) with WITH CHECK on writes.

-- ---------------------------------------------------------------------------
-- Legacy org: home for all rows that predate multi-tenancy.
-- ---------------------------------------------------------------------------

INSERT INTO organizations (id, name, created_by)
VALUES ('00000000-0000-0000-0000-000000000001', 'Legacy', NULL)
ON CONFLICT (id) DO NOTHING;

-- Everyone who already has a profile becomes an owner of the legacy org so
-- existing data stays visible to existing users.
INSERT INTO organization_members (org_id, user_id, role)
SELECT '00000000-0000-0000-0000-000000000001', u.id, 'owner'
FROM public.users u
ON CONFLICT (org_id, user_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- org_id columns + backfill.
--
-- The DEFAULT to the legacy org is a transition-period bridge: service-role
-- writers that predate tenancy (VAPI webhook, voice-session persistence) keep
-- working and their rows land in the legacy org. User-context writes still
-- have to pass the WITH CHECK membership policies below, so a non-legacy user
-- must supply their own org_id explicitly. Remove the defaults once all
-- writers pass org_id (slice 6+).
-- ---------------------------------------------------------------------------

ALTER TABLE service_requests
  ADD COLUMN org_id UUID REFERENCES organizations(id);
UPDATE service_requests SET org_id = '00000000-0000-0000-0000-000000000001';
ALTER TABLE service_requests
  ALTER COLUMN org_id SET NOT NULL,
  ALTER COLUMN org_id SET DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE providers
  ADD COLUMN org_id UUID REFERENCES organizations(id);
UPDATE providers SET org_id = '00000000-0000-0000-0000-000000000001';
ALTER TABLE providers
  ALTER COLUMN org_id SET NOT NULL,
  ALTER COLUMN org_id SET DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE interaction_logs
  ADD COLUMN org_id UUID REFERENCES organizations(id);
UPDATE interaction_logs SET org_id = '00000000-0000-0000-0000-000000000001';
ALTER TABLE interaction_logs
  ALTER COLUMN org_id SET NOT NULL,
  ALTER COLUMN org_id SET DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE voice_call_sessions
  ADD COLUMN org_id UUID REFERENCES organizations(id);
UPDATE voice_call_sessions SET org_id = '00000000-0000-0000-0000-000000000001';
ALTER TABLE voice_call_sessions
  ALTER COLUMN org_id SET NOT NULL,
  ALTER COLUMN org_id SET DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE voice_call_events
  ADD COLUMN org_id UUID REFERENCES organizations(id);
UPDATE voice_call_events SET org_id = '00000000-0000-0000-0000-000000000001';
ALTER TABLE voice_call_events
  ALTER COLUMN org_id SET NOT NULL,
  ALTER COLUMN org_id SET DEFAULT '00000000-0000-0000-0000-000000000001';

CREATE INDEX idx_service_requests_org_id ON service_requests(org_id);
CREATE INDEX idx_providers_org_id ON providers(org_id);
CREATE INDEX idx_interaction_logs_org_id ON interaction_logs(org_id);
CREATE INDEX idx_voice_call_sessions_org_id ON voice_call_sessions(org_id);
CREATE INDEX idx_voice_call_events_org_id ON voice_call_events(org_id);

-- ---------------------------------------------------------------------------
-- Replace the old per-user policies (which also allowed anonymous rows via
-- `user_id IS NULL`) with org-membership tenancy policies.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can view their own service requests" ON service_requests;
DROP POLICY IF EXISTS "Users can insert their own service requests" ON service_requests;
DROP POLICY IF EXISTS "Users can update their own service requests" ON service_requests;
DROP POLICY IF EXISTS "Users can delete their own service requests" ON service_requests;

CREATE POLICY service_requests_tenant_select ON service_requests
  FOR SELECT USING (public.is_org_member(org_id));
CREATE POLICY service_requests_tenant_insert ON service_requests
  FOR INSERT WITH CHECK (public.is_org_member(org_id));
CREATE POLICY service_requests_tenant_update ON service_requests
  FOR UPDATE USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));
CREATE POLICY service_requests_tenant_delete ON service_requests
  FOR DELETE USING (public.is_org_member(org_id));

DROP POLICY IF EXISTS "Users can view providers for their service requests" ON providers;
DROP POLICY IF EXISTS "Users can insert providers for their service requests" ON providers;
DROP POLICY IF EXISTS "Users can update providers for their service requests" ON providers;
DROP POLICY IF EXISTS "Users can delete providers for their service requests" ON providers;

CREATE POLICY providers_tenant_select ON providers
  FOR SELECT USING (public.is_org_member(org_id));
CREATE POLICY providers_tenant_insert ON providers
  FOR INSERT WITH CHECK (public.is_org_member(org_id));
CREATE POLICY providers_tenant_update ON providers
  FOR UPDATE USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));
CREATE POLICY providers_tenant_delete ON providers
  FOR DELETE USING (public.is_org_member(org_id));

DROP POLICY IF EXISTS "Users can view interaction logs for their service requests" ON interaction_logs;
DROP POLICY IF EXISTS "Users can insert interaction logs for their service requests" ON interaction_logs;

CREATE POLICY interaction_logs_tenant_select ON interaction_logs
  FOR SELECT USING (public.is_org_member(org_id));
CREATE POLICY interaction_logs_tenant_insert ON interaction_logs
  FOR INSERT WITH CHECK (public.is_org_member(org_id));
CREATE POLICY interaction_logs_tenant_update ON interaction_logs
  FOR UPDATE USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));
CREATE POLICY interaction_logs_tenant_delete ON interaction_logs
  FOR DELETE USING (public.is_org_member(org_id));

-- voice_call_sessions / voice_call_events had RLS enabled with no policies
-- (service-role only). Grant org members read/write within their tenant.
CREATE POLICY voice_call_sessions_tenant_select ON voice_call_sessions
  FOR SELECT USING (public.is_org_member(org_id));
CREATE POLICY voice_call_sessions_tenant_insert ON voice_call_sessions
  FOR INSERT WITH CHECK (public.is_org_member(org_id));
CREATE POLICY voice_call_sessions_tenant_update ON voice_call_sessions
  FOR UPDATE USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));
CREATE POLICY voice_call_sessions_tenant_delete ON voice_call_sessions
  FOR DELETE USING (public.is_org_member(org_id));

CREATE POLICY voice_call_events_tenant_select ON voice_call_events
  FOR SELECT USING (public.is_org_member(org_id));
CREATE POLICY voice_call_events_tenant_insert ON voice_call_events
  FOR INSERT WITH CHECK (public.is_org_member(org_id));
CREATE POLICY voice_call_events_tenant_update ON voice_call_events
  FOR UPDATE USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));
CREATE POLICY voice_call_events_tenant_delete ON voice_call_events
  FOR DELETE USING (public.is_org_member(org_id));
