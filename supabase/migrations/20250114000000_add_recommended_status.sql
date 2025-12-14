-- Add RECOMMENDED status to request_status enum
-- This status indicates recommendations have been generated and await user selection

ALTER TYPE request_status ADD VALUE IF NOT EXISTS 'RECOMMENDED' AFTER 'ANALYZING';
