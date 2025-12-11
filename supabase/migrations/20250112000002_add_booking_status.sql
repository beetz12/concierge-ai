-- Add BOOKING status to request_status enum
-- This status is used when the user has selected a provider and booking is in progress

ALTER TYPE request_status ADD VALUE IF NOT EXISTS 'BOOKING' AFTER 'ANALYZING';

-- Ensure existing records have valid status values
UPDATE service_requests
SET status = 'PENDING'
WHERE status IS NULL;

-- Add a check constraint to ensure status is never null (extra safety)
ALTER TABLE service_requests
  ADD CONSTRAINT service_requests_status_not_null
  CHECK (status IS NOT NULL);

-- Add comment for documentation
COMMENT ON COLUMN service_requests.status IS
  'Current status of the service request. Values: PENDING (initial), SEARCHING (finding providers), CALLING (calling providers), ANALYZING (generating recommendations), BOOKING (user selected provider, scheduling in progress), COMPLETED (booking confirmed), FAILED (error occurred). Never null due to NOT NULL constraint and DEFAULT value.';
