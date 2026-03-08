-- Migration: Add durable voice call session and event history

CREATE TABLE IF NOT EXISTS voice_call_sessions (
  id TEXT PRIMARY KEY,
  service_request_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  runtime_provider TEXT NOT NULL,
  status TEXT NOT NULL,
  active_agent TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  outcome JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS voice_call_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL REFERENCES voice_call_sessions(id) ON DELETE CASCADE,
  service_request_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  agent_role TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voice_call_sessions_service_request_id
  ON voice_call_sessions(service_request_id);

CREATE INDEX IF NOT EXISTS idx_voice_call_sessions_provider_id
  ON voice_call_sessions(provider_id);

CREATE INDEX IF NOT EXISTS idx_voice_call_sessions_status
  ON voice_call_sessions(status);

CREATE INDEX IF NOT EXISTS idx_voice_call_events_session_id
  ON voice_call_events(session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_voice_call_events_service_request_id
  ON voice_call_events(service_request_id);

CREATE INDEX IF NOT EXISTS idx_voice_call_events_provider_id
  ON voice_call_events(provider_id);

CREATE TRIGGER update_voice_call_sessions_updated_at
  BEFORE UPDATE ON voice_call_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE voice_call_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_call_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE voice_call_sessions IS
  'Durable voice session state for LiveKit/Twilio-driven provider and booking calls.';

COMMENT ON TABLE voice_call_events IS
  'Append-only event history for voice sessions including handoffs, tool calls, and terminal outcomes.';

ALTER PUBLICATION supabase_realtime ADD TABLE voice_call_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE voice_call_events;
