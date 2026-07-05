-- Migration: Landing-page demo funnel (SMS OTP verification + one-per-number demo calls)
--
-- A visitor picks a curated scenario, proves ownership of their phone number
-- via a 6-digit SMS OTP, and receives ONE AI demo call to that number — once
-- per E.164 number, for life.
--
-- Anti-abuse posture lives in the schema:
--   * demo_otp_requests rows are the DURABLE send-rate-limit counters
--     (per-number and per-IP windows are computed by counting rows).
--   * demo_calls.phone_e164 is UNIQUE — the lifetime "one demo call per
--     number" gate is an atomic INSERT (conflict => already used), never
--     in-memory state.

-- ============================================================================
-- demo_otp_requests: one row per OTP send attempt
-- ============================================================================
CREATE TABLE IF NOT EXISTS demo_otp_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164 TEXT NOT NULL,
  -- HMAC-SHA256(code, OTP_HASH_SECRET); the plaintext code is never stored.
  code_hash TEXT NOT NULL,
  ip TEXT,
  -- Failed verification attempts against this code (max 5, then locked).
  attempts INT NOT NULL DEFAULT 0,
  verified_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Rate-limit window scans: count sends per number / per IP since a cutoff.
CREATE INDEX IF NOT EXISTS idx_demo_otp_requests_phone_created
  ON demo_otp_requests(phone_e164, created_at);

CREATE INDEX IF NOT EXISTS idx_demo_otp_requests_ip_created
  ON demo_otp_requests(ip, created_at);

-- ============================================================================
-- demo_calls: one row per dispatched demo call — UNIQUE phone is the
-- lifetime one-call-per-number gate.
-- ============================================================================
CREATE TABLE IF NOT EXISTS demo_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164 TEXT NOT NULL UNIQUE,
  scenario_id TEXT NOT NULL,
  call_id TEXT,
  backend TEXT,
  status TEXT NOT NULL DEFAULT 'dispatched',
  consent_captured_at TIMESTAMPTZ NOT NULL,
  consent_ip TEXT,
  disclosure_version TEXT NOT NULL,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Status polling looks calls up by the backend call id.
CREATE INDEX IF NOT EXISTS idx_demo_calls_call_id
  ON demo_calls(call_id);

-- ============================================================================
-- RLS: service-role access only. Both tables are written exclusively by the
-- API's service client; there are deliberately NO anon/authenticated policies
-- (enabling RLS with no policies denies everything except service role).
-- ============================================================================
ALTER TABLE demo_otp_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_calls ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE demo_otp_requests IS
  'SMS OTP send/verify attempts for the landing-page demo funnel. Rows double as durable send-rate-limit counters (per phone_e164 and per ip).';

COMMENT ON TABLE demo_calls IS
  'One demo call per E.164 number for life: UNIQUE(phone_e164) makes the INSERT the atomic lifetime gate. Also records consent + disclosure version.';
