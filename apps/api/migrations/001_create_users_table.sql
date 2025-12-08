-- Migration: Create users table
-- Description: Creates the users table with basic fields for the example API
-- Run this in your Supabase SQL Editor: https://app.supabase.com/project/_/sql

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create policy: Service role has full access (backend operations)
DROP POLICY IF EXISTS "Service role has full access to users" ON users;
CREATE POLICY "Service role has full access to users"
  ON users
  FOR ALL
  USING (auth.role() = 'service_role');

-- Optional: Create policy for authenticated users to read their own data
-- Uncomment if you need user-facing read access
-- DROP POLICY IF EXISTS "Users can read own data" ON users;
-- CREATE POLICY "Users can read own data"
--   ON users
--   FOR SELECT
--   USING (auth.uid()::text = id::text);

-- Insert sample data (optional - comment out if not needed)
INSERT INTO users (email, name) VALUES
  ('john.doe@example.com', 'John Doe'),
  ('jane.smith@example.com', 'Jane Smith'),
  ('bob.wilson@example.com', 'Bob Wilson')
ON CONFLICT (email) DO NOTHING;

-- Verify the table was created
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'users'
ORDER BY ordinal_position;
