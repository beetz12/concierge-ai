-- Migration: Enhance provider schema for comprehensive research data
-- Adds fields for: review_count, distance, hours_of_operation, is_open_now, place_id
-- These fields support the 10+ provider research feature with Google Places API

-- Add new columns for enhanced provider data
ALTER TABLE providers ADD COLUMN IF NOT EXISTS review_count INTEGER;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS distance DECIMAL(5,1);
ALTER TABLE providers ADD COLUMN IF NOT EXISTS hours_of_operation JSONB;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS is_open_now BOOLEAN;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS place_id TEXT;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS google_maps_uri TEXT;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS international_phone TEXT;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS distance_text TEXT;

-- Add constraints
ALTER TABLE providers ADD CONSTRAINT providers_rating_range
  CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5));

ALTER TABLE providers ADD CONSTRAINT providers_review_count_positive
  CHECK (review_count IS NULL OR review_count >= 0);

ALTER TABLE providers ADD CONSTRAINT providers_distance_positive
  CHECK (distance IS NULL OR distance >= 0);

-- Add indexes for filtering and sorting
CREATE INDEX IF NOT EXISTS idx_providers_rating ON providers(rating DESC);
CREATE INDEX IF NOT EXISTS idx_providers_distance ON providers(distance);
CREATE INDEX IF NOT EXISTS idx_providers_review_count ON providers(review_count DESC);
CREATE INDEX IF NOT EXISTS idx_providers_place_id ON providers(place_id);

-- Create composite index for common filtering patterns
CREATE INDEX IF NOT EXISTS idx_providers_rating_distance
  ON providers(request_id, rating DESC, distance)
  WHERE rating IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN providers.review_count IS 'Total number of Google reviews for this provider';
COMMENT ON COLUMN providers.distance IS 'Distance from user location in miles';
COMMENT ON COLUMN providers.distance_text IS 'Human-readable distance (e.g., "2.3 mi")';
COMMENT ON COLUMN providers.hours_of_operation IS 'Business hours as JSONB array of strings';
COMMENT ON COLUMN providers.is_open_now IS 'Whether provider is currently open';
COMMENT ON COLUMN providers.place_id IS 'Google Place ID for data enrichment';
COMMENT ON COLUMN providers.google_maps_uri IS 'Direct link to Google Maps listing';
COMMENT ON COLUMN providers.website IS 'Provider business website URL';
COMMENT ON COLUMN providers.international_phone IS 'Phone number in E.164 format';
