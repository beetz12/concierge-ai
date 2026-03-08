-- Migration: Add normalized provider-intel evidence storage
-- Stores cross-platform reputation evidence on providers while preserving
-- final user-facing recommendation snapshots on service_requests.recommendations

ALTER TABLE providers
ADD COLUMN IF NOT EXISTS provider_intel JSONB;

COMMENT ON COLUMN providers.provider_intel IS
  'Normalized provider-intel evidence: off-platform reputation sources, review themes, contradiction notes, trade-fit, and identity/research confidence';
