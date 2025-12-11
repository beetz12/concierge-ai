-- Migration: Add booking-related fields to providers table
-- Adds fields for tracking booking confirmations and call details

-- Add booking-related columns
ALTER TABLE providers ADD COLUMN IF NOT EXISTS booking_confirmed BOOLEAN DEFAULT FALSE;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS booking_date TEXT;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS booking_time TEXT;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS confirmation_number TEXT;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS last_call_at TIMESTAMPTZ;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS call_transcript TEXT;

-- Add comments for documentation
COMMENT ON COLUMN providers.booking_confirmed IS 'Whether an appointment has been successfully confirmed with this provider';
COMMENT ON COLUMN providers.booking_date IS 'Confirmed appointment date (e.g., "Tuesday, January 15th, 2025")';
COMMENT ON COLUMN providers.booking_time IS 'Confirmed appointment time (e.g., "2:00 PM")';
COMMENT ON COLUMN providers.confirmation_number IS 'Booking confirmation or reference number from the provider';
COMMENT ON COLUMN providers.last_call_at IS 'Timestamp of the most recent VAPI call to this provider';
COMMENT ON COLUMN providers.call_transcript IS 'Transcript of the most recent booking call';

-- Add index for finding booked providers
CREATE INDEX IF NOT EXISTS idx_providers_booking_confirmed ON providers(booking_confirmed, booking_date)
  WHERE booking_confirmed = TRUE;
