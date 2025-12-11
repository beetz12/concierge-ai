-- Migration: Add contact preference fields for user notifications
-- Date: 2025-12-11
-- Feature: Preferred Contact (phone vs text)

-- Add contact preference and notification tracking to service_requests
ALTER TABLE service_requests
ADD COLUMN IF NOT EXISTS preferred_contact TEXT DEFAULT 'text' CHECK (preferred_contact IN ('phone', 'text')),
ADD COLUMN IF NOT EXISTS user_phone TEXT,
ADD COLUMN IF NOT EXISTS notification_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS notification_method TEXT CHECK (notification_method IN ('sms', 'vapi', NULL)),
ADD COLUMN IF NOT EXISTS user_selection INTEGER CHECK (user_selection >= 1 AND user_selection <= 3),
ADD COLUMN IF NOT EXISTS sms_message_sid TEXT;

-- Add index for looking up requests by user phone (for SMS webhook correlation)
CREATE INDEX IF NOT EXISTS idx_service_requests_user_phone ON service_requests(user_phone) WHERE user_phone IS NOT NULL;

-- Add index for finding pending notifications
CREATE INDEX IF NOT EXISTS idx_service_requests_notification_pending ON service_requests(status, notification_sent_at) WHERE notification_sent_at IS NULL;

-- Comment the columns for documentation
COMMENT ON COLUMN service_requests.preferred_contact IS 'User preference: phone (VAPI call) or text (SMS)';
COMMENT ON COLUMN service_requests.user_phone IS 'User phone number in E.164 format for notifications';
COMMENT ON COLUMN service_requests.notification_sent_at IS 'Timestamp when notification was sent';
COMMENT ON COLUMN service_requests.notification_method IS 'Method used: sms or vapi';
COMMENT ON COLUMN service_requests.user_selection IS 'Provider number selected by user (1, 2, or 3)';
COMMENT ON COLUMN service_requests.sms_message_sid IS 'Twilio MessageSid for correlating SMS responses';
