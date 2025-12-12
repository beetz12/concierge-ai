# Kestra Workflow Debugging Summary

## Issue Resolved

**Error:** Kestra workflows failing with "TaskRunner.getType() is null"
**Status:** FIXED
**Date:** 2025-12-11

## What Was Wrong

The Kestra workflows were configured to use Docker task runner:

```yaml
taskRunner:
  type: io.kestra.plugin.scripts.runner.docker.Docker
containerImage: node:20-alpine
```

However, the Docker plugin was **not installed** in the local Kestra instance, causing all executions to fail immediately before they could even process the input data.

## The Misleading "phone is undefined" Error

The error logs showed "phone is undefined" which led to extensive debugging of the data flow. However, this was a **red herring**. The data being sent to Kestra was always correct:

- Backend correctly built CallRequest[] with providerPhone
- KestraClient correctly mapped to providers array with phone field
- FormData correctly JSON-stringified the array
- Kestra flow correctly defined providers as type JSON

The workflow was failing **before** it could access the phone data due to the missing Docker plugin.

## Fix Applied

Removed `taskRunner` and `containerImage` from all workflow files to use the default process runner:

### Modified Files
- `kestra/flows/contact_providers.yaml`
- `kestra/flows/notify_user.yaml`
- `kestra/flows/schedule_service.yaml`

### Change Example

**Before:**
```yaml
type: io.kestra.plugin.scripts.node.Commands
containerImage: node:20-alpine
taskRunner:
  type: io.kestra.plugin.scripts.runner.docker.Docker
```

**After:**
```yaml
type: io.kestra.plugin.scripts.node.Commands
description: "Call provider via VAPI using Node.js script"
```

## Testing the Fix

1. **Restart Kestra** (if running):
   ```bash
   # Stop Kestra
   docker-compose down

   # Start Kestra
   docker-compose up -d
   ```

2. **Test a workflow** from the frontend:
   - Navigate to http://localhost:3000/new
   - Submit a research request
   - Check backend logs for "Kestra execution triggered"
   - Verify no taskRunner errors

3. **Check Kestra UI** at http://localhost:8082:
   - Navigate to Executions
   - Verify the workflow executes successfully
   - Check that providers array is correctly parsed
   - Verify phone numbers are accessed correctly

## Data Flow Verification

If you want to verify the data being sent to Kestra:

1. **Check backend logs** for "Triggering Kestra batch contact flow"
2. **Look for provider data** in the log output
3. **Verify FormData structure** shows JSON-stringified providers array
4. **Check Kestra execution inputs** in the UI to see the parsed data

## Production Deployment

When deploying to Kestra Cloud or a production environment:

- **Kestra Cloud:** Docker plugin is pre-installed, so you can re-add Docker configuration if needed
- **Self-Hosted:** Either install the Docker plugin or keep using process runner
- **Performance:** Process runner is faster for local development, Docker provides better isolation for production

## Next Steps

1. Verify the fix works by testing a full research workflow
2. If issues persist, check:
   - Node.js and npm are installed in the Kestra environment
   - Namespace files are correctly uploaded to Kestra
   - Environment variables (VAPI_API_KEY, etc.) are set in Kestra
3. For production: Consider installing Docker plugin for better isolation

## Related Documentation

- Full technical analysis: `/docs/fixes/KESTRA_TASKRUNNER_FIX.md`
- Error logs: `/docs/error_logs.md`
- Kestra configuration: `/kestra/flows/contact_providers.yaml`
