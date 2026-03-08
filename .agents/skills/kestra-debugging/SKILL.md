---
name: kestra-debugging
description: Diagnose and fix Kestra workflow failures - JSON parsing, taskRunner config, EachParallel issues, missing dependencies
---

# Kestra Workflow Debugging Skill

Diagnose and fix Kestra workflow failures in the AI Concierge application. This skill captures common issues, root causes, and proven fixes.

## When to Use

- Kestra workflow executions fail with errors
- `contact_providers`, `schedule_service`, `notify_user` flows fail
- Errors related to `taskRunner`, `EachParallel`, JSON parsing, or script execution
- Environment variables or script dependencies are missing

## Quick Diagnosis

| Error Pattern | Root Cause | Fix |
|---------------|------------|-----|
| `Unable to find 'X' in {{ taskrun.value.X }}` | JSON not parsed | Use `{{ fromJson(taskrun.value).X }}` |
| `TaskRunner.getType() null` | Empty taskRunner | Add type or remove taskRunner |
| `Unrecognized field "concurrencyLimit"` | Wrong property | Use `concurrent` not `concurrencyLimit` |
| `Cannot find module` | Missing npm install | Add `beforeCommands` |
| Config file import error | Missing config in scripts/ | Copy from `apps/api/dist/` |
| `Permission denied` (Docker socket) | Socket permissions 660 | Fix docker-compose entrypoint |
| `Loaded 0 namespace files` | namespaceFiles not working | Use inline `Script` task instead |
| `Invalid Key` (VAPI 401) | Wrong API key type | Check VAPI_API_KEY in docker-compose |
| `id must be a valid UUID` | Wrong SDK method signature | Use `vapi.calls.get({ id: callId })` not `vapi.calls.get(callId)` |

---

## Issue #1: JSON Parsing in EachParallel (Most Common)

**Error:** `Unable to find 'phone' used in the expression {{ taskrun.value.phone }}`

**Cause:** `taskrun.value` is a JSON **string**, not an object.

**Fix:**
```yaml
# WRONG
- node script.js "{{ taskrun.value.phone }}"

# CORRECT
- node script.js "{{ fromJson(taskrun.value).phone }}"
```

---

## Issue #2: TaskRunner Configuration

**Error:** `Cannot invoke "TaskRunner.getType()" because taskRunner is null`

**Cause:** Empty `taskRunner:` declaration in YAML.

**Fix - Option A (Remove):**
```yaml
# Just remove taskRunner entirely
namespaceFiles:
  enabled: true
```

**Fix - Option B (Full Config):**
```yaml
taskRunner:
  type: io.kestra.plugin.scripts.runner.docker.Docker
namespaceFiles:
  enabled: true
```

---

## Issue #3: EachParallel Concurrency

**Error:** `Unrecognized field "concurrencyLimit"`

**Fix:**
```yaml
# WRONG
concurrencyLimit: 5

# CORRECT
concurrent: 5
```

---

## Issue #4: Missing npm Dependencies

**Error:** `Cannot find module '@vapi-ai/server-sdk'`

**Fix:**
```yaml
beforeCommands:
  - npm install @vapi-ai/server-sdk
commands:
  - node scripts/call-provider.js ...
```

**Dependency Reference:**
- `call-provider.js` → `@vapi-ai/server-sdk`
- `schedule-booking.js` → `@vapi-ai/server-sdk`
- `send-notification.js` → `twilio`

---

## Issue #5: Missing Config Files

**Error:** `Cannot find module './booking-assistant-config.js'`

**Fix:**
```bash
cp apps/api/dist/services/vapi/assistant-config.js kestra/scripts/
cp apps/api/dist/services/vapi/booking-assistant-config.js kestra/scripts/
```

---

## Issue #6: Missing Environment Variables

**Error:** `VAPI_API_KEY is not defined`

**Fix:**
```yaml
env:
  VAPI_API_KEY: "{{ envs.vapi_api_key }}"
  VAPI_PHONE_NUMBER_ID: "{{ envs.vapi_phone_number_id }}"
  GEMINI_API_KEY: "{{ envs.gemini_api_key }}"
```

---

## Issue #7: Docker Socket Permission Denied

**Error:** `Permission denied` or `java.net.BindException: Permission denied`

**Cause:** Kestra runs as user `kestra` (uid=1000) but Docker socket has permissions `660` with owner `root:root`. The kestra user can't access the socket.

**Diagnosis:**
```bash
# Check socket permissions inside container
docker exec kestra ls -la /var/run/docker.sock
# If shows srw-rw---- (660), that's the problem
```

**Fix - Update docker-compose.yml entrypoint:**
```yaml
kestra:
  image: kestra/kestra:v1.1.6
  user: "root"
  entrypoint: ["/bin/sh", "-c", "chmod 666 /var/run/docker.sock && exec /app/kestra server standalone"]
```

**Temporary Fix (lost on restart):**
```bash
docker exec -u root kestra chmod 666 /var/run/docker.sock
```

**After fix, restart Kestra:**
```bash
docker compose restart kestra
```

---

## Issue #8: Namespace Files Not Loading (Most Reliable Fix)

**Error:** `Loaded 0 namespace files from 'namespace'` + `Cannot find module 'scripts/file.js'`

**Cause:** Namespace file storage may not sync correctly with workflow execution. Files uploaded via API exist in storage but aren't loaded by the Docker task runner.

**Diagnosis:**
```bash
# Files ARE in storage
docker exec kestra ls -la /app/storage/main/ai_concierge/_files/scripts/

# But workflow shows "Loaded 0 namespace files"
docker logs kestra | grep "namespace files"
```

**Fix - Use Inline Script (Recommended):**
Instead of `io.kestra.plugin.scripts.node.Commands` with external files, use `io.kestra.plugin.scripts.node.Script` with inline code:

```yaml
- id: call_provider
  type: io.kestra.plugin.scripts.node.Script
  beforeCommands:
    - npm install @vapi-ai/server-sdk
  env:
    VAPI_API_KEY: "{{ envs.vapi_api_key }}"
    PHONE: "{{ fromJson(taskrun.value).phone }}"
    PROVIDER_NAME: "{{ fromJson(taskrun.value).name }}"
  script: |
    const { VapiClient } = require('@vapi-ai/server-sdk');
    const vapi = new VapiClient({ token: process.env.VAPI_API_KEY });

    console.log(`Calling ${process.env.PROVIDER_NAME} at ${process.env.PHONE}`);

    async function main() {
      const call = await vapi.calls.create({
        phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
        customer: { number: process.env.PHONE },
        assistant: { /* inline config */ }
      });
      console.log(JSON.stringify({ callId: call.id }));
    }

    main().catch(e => { console.error(e); process.exit(1); });
```

**Why Inline Scripts:**
- No external file dependencies
- All parameters via environment variables
- Avoids namespace file sync issues
- Works reliably in Docker-in-Docker setups

---

## Working Template (Inline Script - Recommended)

```yaml
- id: call_providers_parallel
  type: io.kestra.plugin.core.flow.EachParallel
  value: "{{ inputs.providers }}"
  concurrent: "{{ inputs.max_concurrent }}"
  tasks:
    - id: call_single_provider
      type: io.kestra.plugin.scripts.node.Script
      beforeCommands:
        - npm install @vapi-ai/server-sdk
      env:
        VAPI_API_KEY: "{{ envs.vapi_api_key }}"
        VAPI_PHONE_NUMBER_ID: "{{ envs.vapi_phone_number_id }}"
        PHONE: "{{ fromJson(taskrun.value).phone }}"
        NAME: "{{ fromJson(taskrun.value).name }}"
        ID: "{{ fromJson(taskrun.value).id }}"
      script: |
        const { VapiClient } = require('@vapi-ai/server-sdk');
        // Script code here with process.env.PHONE, etc.
```

---

## Deployment Commands

```bash
# Deploy all flows
npm run migrate:workflow

# Preview changes
npm run migrate:workflow:dry
```

---

## Key Files

| File | Purpose |
|------|---------|
| `kestra/flows/*.yaml` | Workflow definitions |
| `kestra/scripts/*.js` | Execution scripts |
| `kestra/scripts/deploy-flows.js` | Deployment script |
| `apps/api/src/services/vapi/kestra.client.ts` | API client |

---

## Issue #9: VAPI SDK `calls.get()` Wrong Method Signature

**Error:** `"id must be a valid UUID"` (400 Bad Request) after call initiates successfully

**Cause:** VAPI SDK v0.11.0 expects an **object parameter**, not a string.

**Fix:**
```javascript
// WRONG - passes string directly
const updated = await vapi.calls.get(call.id);

// CORRECT - passes object with id property
const updated = await vapi.calls.get({ id: call.id });
```

**Files affected:**
- `kestra/flows/contact_providers.yaml` (inline script)
- `kestra/scripts/call-provider.js`
- `kestra/scripts/schedule-booking.js`

**Why this happens:** The call **initiates successfully** (you see the call ID in logs), but the polling loop fails because `calls.get()` receives a string instead of an object. The SDK's validation rejects it as "invalid UUID" even though the UUID format is correct.

---

## Pre-Deploy Checklist

- [ ] `taskrun.value.X` → `fromJson(taskrun.value).X`
- [ ] `taskRunner` fully configured or removed
- [ ] `concurrent` property (not `concurrencyLimit`)
- [ ] `beforeCommands` with npm dependencies
- [ ] Use `io.kestra.plugin.scripts.node.Script` with inline code (recommended)
- [ ] All dynamic values via environment variables in `env` block
- [ ] Docker socket permissions fixed (chmod 666 in entrypoint)
- [ ] VAPI SDK: `vapi.calls.get({ id: callId })` not `vapi.calls.get(callId)`
