-- Fix: Create a proper UNIQUE CONSTRAINT instead of just a UNIQUE INDEX
-- PostgreSQL's ON CONFLICT (column) requires a UNIQUE CONSTRAINT, not just an index
-- UNIQUE CONSTRAINTS naturally allow multiple NULLs in PostgreSQL

-- Drop the partial indexes (they don't work with Supabase upsert)
DROP INDEX IF EXISTS idx_interaction_logs_call_id_unique;
DROP INDEX IF EXISTS idx_interaction_logs_call_id;

-- Create a proper UNIQUE CONSTRAINT
-- This allows ON CONFLICT (call_id) DO NOTHING to work
-- Multiple NULL values are allowed by PostgreSQL unique constraints
ALTER TABLE interaction_logs
ADD CONSTRAINT interaction_logs_call_id_unique UNIQUE (call_id);

-- Create a regular index for query performance (separate from constraint)
CREATE INDEX IF NOT EXISTS idx_interaction_logs_call_id
ON interaction_logs (call_id)
WHERE call_id IS NOT NULL;
