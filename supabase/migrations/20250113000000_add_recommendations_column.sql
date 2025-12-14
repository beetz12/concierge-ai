-- Migration: Add recommendations column to service_requests
-- This enables backend-generated recommendations to be persisted and fetched by frontend

-- Add recommendations JSONB column to service_requests
ALTER TABLE service_requests
ADD COLUMN IF NOT EXISTS recommendations JSONB;

-- Add index for efficient querying (GIN index for JSONB)
CREATE INDEX IF NOT EXISTS idx_service_requests_recommendations
ON service_requests USING gin(recommendations);

-- Add comment for documentation
COMMENT ON COLUMN service_requests.recommendations IS
'AI-generated provider recommendations. Structure: { recommendations: ProviderRecommendation[], overallRecommendation: string, analysisNotes: string, stats: { totalCalls, qualifiedProviders, disqualifiedProviders, failedCalls } }';
