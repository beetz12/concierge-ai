# Fix Kestra Health Check and Strict Mode Issues

**Date**: 2025-12-11
**Author**: Claude AI
**Status**: In Progress
**Type**: Fix

## Table of Contents
- [Problem Summary](#problem-summary)
- [Issue Analysis](#issue-analysis)
- [Solution](#solution)
- [Implementation Plan](#implementation-plan)
- [Testing Strategy](#testing-strategy)

## Problem Summary

Three interconnected Kestra integration issues:
1. Health check returns 404 (wrong endpoint)
2. Research still falls back despite KESTRA_ENABLED=true
3. Flow not synced to Kestra database after YAML update

## Issue Analysis

### Issue 1: Health Check 404

**Symptom:**
```
AxiosError: Request failed with status code 404
url: "http://localhost:8082/api/v1/health"
```

**Root Cause:** The `/api/v1/health` endpoint doesn't exist in local Kestra. However, `/api/v1/configs` returns 200 with version info.

**Evidence:**
```bash
curl http://localhost:8082/api/v1/health  # 404
curl http://localhost:8082/api/v1/configs # 200 (returns version info)
```

### Issue 2: Research Falls Back Despite Strict Mode

**Symptom:** Research completes successfully using Direct Gemini even when KESTRA_ENABLED=true and Kestra is unavailable.

**Root Cause:** The `shouldUseKestra()` method in `research.service.ts` catches health check errors and returns `false` instead of throwing:

```typescript
// research.service.ts lines 180-187
} catch (error) {
  this.logger.debug({ error }, "Kestra health check failed");
  return false;  // <-- Allows fallback instead of throwing
}
```

The strict mode check at lines 66-75 is never triggered because no error is thrown.

### Issue 3: Flow Not Synced to Kestra

**Symptom:** Even after updating YAML file, Kestra still shows old output expression.

**Evidence:** API query shows old value still in Kestra database:
```json
"outputs":[{"id":"call_result","value":"{{ outputs.call_provider_script.vars.output }}"}]
```

Should be:
```json
"outputs":[{"id":"call_result","value":"{{ outputs.call_provider_script.vars.stdout }}"}]
```

**Root Cause:** YAML file was updated but never re-uploaded to Kestra.

## Solution

### Fix 1: Update Health Check Endpoint

**Files:**
- `apps/api/src/services/vapi/kestra.client.ts` (line 115)
- `apps/api/src/services/research/kestra-research.client.ts` (line 115)

**Change:**
```typescript
// FROM:
const response = await axios.get(`${this.baseUrl}/api/v1/health`, {...});

// TO:
const response = await axios.get(`${this.baseUrl}/api/v1/configs`, {...});
```

### Fix 2: Make Research Strict Mode Work

**File:** `apps/api/src/services/research/research.service.ts` (lines 180-187)

**Change:**
```typescript
// FROM:
} catch (error) {
  this.logger.debug({ error }, "Kestra health check failed");
  return false;
}

// TO:
} catch (error) {
  this.logger.error({ error }, "Kestra health check failed");
  throw error;
}
```

### Fix 3: Re-upload Flow to Kestra

**Command:**
```bash
curl -X PUT "http://localhost:8082/api/v1/flows/ai_concierge/contact_providers" \
  -u admin@kestra.local:Admin123456 \
  -H "Content-Type: application/x-yaml" \
  --data-binary @kestra/prod_flows/ai_concierge-contact_providers.yml
```

## Implementation Plan

1. **Phase 1:** Fix health check endpoint in both Kestra clients
2. **Phase 2:** Fix research service strict mode
3. **Phase 3:** Re-upload flow to Kestra
4. **Phase 4:** Verify TypeScript build
5. **Phase 5:** Test end-to-end

## Testing Strategy

### Verification Steps

1. **Health Check:**
```bash
# Should return 200 after fix
curl -s -o /dev/null -w "%{http_code}" \
  -u admin@kestra.local:Admin123456 \
  http://localhost:8082/api/v1/configs
```

2. **Flow Sync:**
```bash
# Should show vars.stdout after re-upload
curl -s -u admin@kestra.local:Admin123456 \
  "http://localhost:8082/api/v1/flows/ai_concierge/contact_providers" | \
  grep -o '"value":"[^"]*"'
```

3. **Strict Mode:**
- Stop Kestra Docker
- Attempt provider research
- Should throw error, NOT fall back to Direct Gemini

### Success Criteria

- [ ] Health check returns 200
- [ ] Flow in Kestra shows `vars.stdout`
- [ ] Research throws error when Kestra unavailable
- [ ] TypeScript build passes

---

## Document Metadata

**Last Updated**: 2025-12-11
**Implementation Status**: In Progress
**Related Documents**:
- [FIX_KESTRA_OUTPUT_VARS_STDOUT.md](./FIX_KESTRA_OUTPUT_VARS_STDOUT.md)

**Change Log**:
- 2025-12-11 - Initial creation
