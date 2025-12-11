-- Migration: Add call_id to interaction_logs with unique constraint
-- Purpose: Prevent duplicate call logs at the database level (2025 best practice)
-- This uses ON CONFLICT DO NOTHING pattern instead of application-level deduplication

-- Add call_id column to interaction_logs (nullable for non-call logs like booking, research)
ALTER TABLE interaction_logs
ADD COLUMN IF NOT EXISTS call_id TEXT;

-- Unique partial index - prevents duplicate call logs
-- Allows multiple NULLs (for booking logs, research steps, etc.)
-- This is the 2025 best practice: database-level constraint, not application logic
CREATE UNIQUE INDEX IF NOT EXISTS idx_interaction_logs_call_id_unique
ON interaction_logs (call_id)
WHERE call_id IS NOT NULL;

-- Performance index for call_id lookups
CREATE INDEX IF NOT EXISTS idx_interaction_logs_call_id
ON interaction_logs (call_id)
WHERE call_id IS NOT NULL;

-- Add descriptive comment
COMMENT ON COLUMN interaction_logs.call_id IS
'VAPI call ID. Unique constraint prevents duplicate call logs when both webhook and polling paths execute.';
