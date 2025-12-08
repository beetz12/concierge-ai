#!/bin/bash
# Generate TypeScript types from Supabase database schema
#
# Prerequisites:
# 1. Install Supabase CLI: npm install -g supabase
# 2. Link to your project: supabase link --project-ref your-project-ref
#
# Usage: ./scripts/generate-types.sh

set -e

# Check if SUPABASE_PROJECT_ID is set
if [ -z "$SUPABASE_PROJECT_ID" ]; then
  echo "Error: SUPABASE_PROJECT_ID environment variable is not set"
  echo "Usage: SUPABASE_PROJECT_ID=your-project-ref ./scripts/generate-types.sh"
  exit 1
fi

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
  echo "Error: Supabase CLI is not installed"
  echo "Install it with: npm install -g supabase"
  exit 1
fi

# Generate types
echo "Generating TypeScript types from Supabase..."
npx supabase gen types typescript \
  --project-id "$SUPABASE_PROJECT_ID" \
  --schema public \
  > src/types/database.ts

echo "✓ Types generated successfully at src/types/database.ts"
echo "Update src/lib/supabase.ts to import these types:"
echo ""
echo "  import { Database } from '../types/database.js';"
echo "  export type { Database };"
