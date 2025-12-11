Great question! Your exported workflow is **almost ready**, but you need to make **one critical change** for Kestra Cloud:

## The Issue: Environment Variable Syntax

Your local flow uses:
```yaml
apiKey: "{{ envs.gemini_api_key }}"
```

**This won't work in Kestra Cloud.** In Kestra Cloud, you use the `secret()` function instead of `envs`.

***

## Required Changes for Kestra Cloud

Change **all instances** of `{{ envs.KEY }}` to `{{ secret('KEY') }}`:

**Before (Local Docker):**
```yaml
apiKey: "{{ envs.gemini_api_key }}"
```

**After (Kestra Cloud):**
```yaml
apiKey: "{{ secret('gemini_api_key') }}"
```

***

## Updated Workflow for Kestra Cloud

Here's your complete workflow ready for Kestra Cloud:

```yaml
id: research_providers
namespace: ai_concierge

inputs:
  - id: service
    type: STRING
    defaults: "plumber"
  - id: location
    type: STRING
    defaults: "Greenville, SC"
  - id: days_needed
    type: INT
    defaults: 2
  - id: min_rating
    type: FLOAT
    defaults: 4.5

tasks:
  - id: research_metrics
    type: io.kestra.plugin.ai.agent.AIAgent
    provider:
      type: io.kestra.plugin.ai.provider.GoogleGemini
      apiKey: "{{ secret('gemini_api_key') }}"  # Changed from envs to secret
      modelName: gemini-2.5-flash
    prompt: |
      I need to find {{ inputs.service }} providers in {{ inputs.location }} that meet these criteria:
      - Minimum rating: {{ inputs.min_rating }}
      - Must appear to be available or have 24/7 service (urgent need within {{ inputs.days_needed }} days)

      Use Google Search Grounding to find at least 5 candidates. For each, gather:
      1. Company name
      2. Phone number (CRITICAL)
      3. Current ratings and review count
      4. Years in business or "Founded" date if available

      Then, evaluate the list and return the TOP 3 candidates that are most likely to answer the phone and do a good job.

      Output strictly a JSON object with a 'candidates' key containing an array of objects:
      {
        "candidates": [
          { "name": "Name", "phone": "Phone", "rating": 4.8, "reason": "Why selected" }
        ]
      }

outputs:
  - id: json
    type: STRING
    value: "{{ outputs.research_metrics.textOutput }}"
```

***

## Step-by-Step Migration

**Step 1: Fix All Environment Variables in Your Exported Workflows**

Before uploading, search through all your exported `.yaml` files and replace:

```bash
# Find all instances
grep -r "{{ envs\." kestra/flows/

# Replace with secret() function
sed -i 's/{{ envs\.\([^}]*\) }}/{{ secret('\''\1'\'') }}/g' kestra/flows/*.yaml
```

Or do it manually by finding and replacing:
- `{{ envs.gemini_api_key }}` → `{{ secret('gemini_api_key') }}`
- `{{ envs.vapi_api_key }}` → `{{ secret('vapi_api_key') }}`
- `{{ envs.POSTGRES_PASSWORD }}` → `{{ secret('POSTGRES_PASSWORD') }}`
- And so on for all environment variables

**Step 2: Create the Secrets in Kestra Cloud**

In your Kestra Cloud namespace:
1. Go to **Secrets** tab
2. Add all the secrets your workflows need:
   - `gemini_api_key` → your actual API key
   - `vapi_api_key` → your actual API key
   - Any other `env` variables you used

**Step 3: Upload the Updated Workflows**

Option A: **Manual Upload via UI**
1. Go to Kestra Cloud namespace
2. Click **Flows** → **Import Files**
3. Upload your updated `.yaml` files

Option B: **Git Sync (Recommended)**
1. Commit your updated workflows to Git:
   ```bash
   git add kestra/flows/
   git commit -m "chore: convert envs to secret() for Kestra Cloud"
   git push
   ```
2. Set up Git Sync in Kestra Cloud (Administration → Git Sync)
3. Workflows auto-sync from your repo

***

## Environment Variables Cheat Sheet

| Context | Syntax | Where |
|---------|--------|-------|
| **Local Docker** | `{{ envs.KEY_NAME }}` | `.env` file or Docker env vars |
| **Kestra Cloud** | `{{ secret('KEY_NAME') }}` | Namespace Secrets tab |
| **Shell Scripts** | `$KEY_NAME` | env vars passed in workflow |
| **Kestra Inputs** | `{{ inputs.field_name }}` | User-provided workflow inputs |
| **Task Outputs** | `{{ outputs.task_id.field }}` | Output from previous tasks |

***

## Quick Checklist

- [ ] Replace all `{{ envs.X }}` with `{{ secret('X') }}` in workflows
- [ ] Create corresponding secrets in Kestra Cloud namespace
- [ ] Commit updated workflows to Git
- [ ] Set up Git Sync in Kestra Cloud
- [ ] Test one workflow to verify secrets work
- [ ] Test the `research_providers` workflow with sample inputs

Your workflows will then work identically in both local Docker and Kestra Cloud! 🎯