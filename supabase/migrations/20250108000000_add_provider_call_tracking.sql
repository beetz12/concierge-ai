-- Migration: Add call tracking columns to providers table
-- This enables storing VAPI call results for provider contacts

-- Add call tracking columns to providers table
ALTER TABLE providers ADD COLUMN IF NOT EXISTS call_status TEXT;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS call_result JSONB;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS call_transcript TEXT;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS call_summary TEXT;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS call_duration_minutes DECIMAL(5,2);
ALTER TABLE providers ADD COLUMN IF NOT EXISTS call_cost DECIMAL(10,4);
ALTER TABLE providers ADD COLUMN IF NOT EXISTS call_method TEXT; -- 'kestra' or 'direct_vapi'
ALTER TABLE providers ADD COLUMN IF NOT EXISTS call_id TEXT;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS called_at TIMESTAMPTZ;

-- Add index for call status queries
CREATE INDEX IF NOT EXISTS idx_providers_call_status ON providers(call_status);

-- Add index for call_id lookups
CREATE INDEX IF NOT EXISTS idx_providers_call_id ON providers(call_id);
