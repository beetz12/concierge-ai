# Kestra TaskRunner Fix

**Date:** 2025-12-11
**Issue:** Kestra workflows failing with "TaskRunner.getType() is null" error
**Root Cause:** Docker plugin not installed in local Kestra instance

## Problem Summary

All Kestra workflows using `io.kestra.plugin.scripts.node.Commands` were failing with:

```
Cannot invoke "io.kestra.core.models.tasks.runners.TaskRunner.getType()"
because the return value of "io.kestra.plugin.scripts.exec.AbstractExecScript.getTaskRunner()" is null
```

The workflows were configured to use Docker task runner:

```yaml
taskRunner:
  type: io.kestra.plugin.scripts.runner.docker.Docker
containerImage: node:20-alpine
```

However, the Docker plugin (`kestra-plugin-scripts`) was **not installed** in the local Kestra instance.

## Data Flow Analysis (Not the Issue)

Initial investigation focused on the "phone is undefined" error mentioned in logs. Data flow analysis revealed:

1. **Frontend → Backend:** Correctly sends providers array with `phone` field
2. **Backend → KestraClient:** Correctly maps to `CallRequest[]` with `providerPhone` field
3. **KestraClient → Kestra:** Correctly transforms to providers array with `phone` field
4. **FormData encoding:** Correctly JSON-stringifies the array per Kestra requirements
5. **Kestra flow input:** Correctly defines `providers` as type `JSON`

**Conclusion:** The data being sent to Kestra was always correct. The workflow was failing before it could even access the data.

## Solution

Removed the `taskRunner` and `containerImage` configuration from all affected workflows to use the default process runner instead of Docker:

### Files Modified

1. `/Users/dave/Work/concierge-ai/kestra/flows/contact_providers.yaml`
2. `/Users/dave/Work/concierge-ai/kestra/flows/notify_user.yaml`
3. `/Users/dave/Work/concierge-ai/kestra/flows/schedule_service.yaml`

### Changes Made

**Before:**
```yaml
- id: call_single_provider
  type: io.kestra.plugin.scripts.node.Commands
  containerImage: node:20-alpine
  taskRunner:
    type: io.kestra.plugin.scripts.runner.docker.Docker
  namespaceFiles:
    enabled: true
```

**After:**
```yaml
- id: call_single_provider
  type: io.kestra.plugin.scripts.node.Commands
  description: "Call provider via VAPI using Node.js script"
  namespaceFiles:
    enabled: true
```

## Alternative Solutions (Not Implemented)

### Option 1: Install Docker Plugin

Install the Kestra Docker plugin via the UI:
1. Navigate to http://localhost:8082
2. Go to Plugins section
3. Search for "kestra-plugin-scripts"
4. Install the Docker runner plugin

**Pros:** Enables container isolation, better for production
**Cons:** Requires manual setup, slower execution locally

### Option 2: Use Cloud-Ready Configuration

Keep Docker configuration but add fallback:
```yaml
taskRunner:
  type: io.kestra.plugin.scripts.runner.docker.Docker
  pullPolicy: IF_NOT_PRESENT
  networkMode: host
```

**Pros:** Works in both local and cloud
**Cons:** Still requires Docker plugin installation

## Testing

After applying the fix, test by:

1. Restart Kestra to pick up updated flows
2. Trigger a research workflow from the frontend
3. Verify batch calls execute without taskRunner errors
4. Check that provider phone numbers are correctly accessed

## Impact

- **Local Development:** Workflows now use process runner (faster, no Docker overhead)
- **Production:** If deploying to Kestra Cloud, Docker plugin is pre-installed
- **Data Flow:** No changes needed - data was always correct
- **Performance:** Slightly faster local execution without Docker containerization

## Related Files

- Backend data transformation: `/Users/dave/Work/concierge-ai/apps/api/src/services/vapi/kestra.client.ts` (lines 335-339)
- Route handler: `/Users/dave/Work/concierge-ai/apps/api/src/routes/providers.ts` (lines 659-671)
- Calling service: `/Users/dave/Work/concierge-ai/apps/api/src/services/vapi/provider-calling.service.ts` (lines 126-224)
- Error logs: `/Users/dave/Work/concierge-ai/docs/error_logs.md` (lines 249-266)
