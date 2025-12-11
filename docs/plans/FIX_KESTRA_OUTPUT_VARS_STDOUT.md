# Fix Kestra Output Expression: vars.output → vars.stdout

**Date**: 2025-12-11
**Author**: Claude AI
**Status**: In Progress
**Type**: Fix

## Table of Contents
- [Problem Summary](#problem-summary)
- [Root Cause Analysis](#root-cause-analysis)
- [Solution](#solution)
- [Files to Update](#files-to-update)
- [Implementation Plan](#implementation-plan)
- [Testing Strategy](#testing-strategy)

## Problem Summary

Kestra workflow execution fails with error:
```
Failed to render output values: Unable to find vars used in the expression {{ outputs.call_provider_script.vars.output }}
```

## Root Cause Analysis

### The Issue

The Kestra workflow YAML files use an **incorrect output property name**:

```yaml
# CURRENT (BROKEN)
value: "{{ outputs.call_provider_script.vars.output }}"
```

### Why It's Wrong

For `io.kestra.plugin.scripts.node.Commands` tasks, the available output properties are:

| Property | Description | Status |
|----------|-------------|--------|
| `vars.stdout` | Standard output of the command | ✅ CORRECT |
| `vars.stderr` | Standard error of the command | ✅ Available |
| `vars.exitCode` | Exit code of the command | ✅ Available |
| `vars.output` | N/A | ❌ DOES NOT EXIST |

### Historical Context

The migration from local Kestra to Kestra Cloud involved changing from `stdOutLine` (legacy pattern) to `vars.*` namespace. The change was directionally correct, but used the wrong property name:

| Pattern | Era | Status |
|---------|-----|--------|
| `stdOutLine` | Legacy (shell.Scripts) | ❌ Deprecated |
| `vars.output` | Migration attempt | ❌ Wrong property name |
| `vars.stdout` | Correct pattern | ✅ Universal (Local + Cloud) |

## Solution

### The Fix

Change all occurrences of `.vars.output` to `.vars.stdout` in Kestra workflow YAML files:

```yaml
# BEFORE (BROKEN)
value: "{{ outputs.call_provider_script.vars.output }}"

# AFTER (CORRECT)
value: "{{ outputs.call_provider_script.vars.stdout }}"
```

### Why This Works Everywhere

1. **Local Docker Kestra**: `vars.stdout` captures stdout ✅
2. **Kestra Cloud**: `vars.stdout` captures stdout ✅
3. **All script types**: Commands, Script, Shell all use `vars.stdout`

## Files to Update

| File | Location | Change |
|------|----------|--------|
| `kestra/prod_flows/ai_concierge-contact_providers.yml` | Line 43 | `.vars.output` → `.vars.stdout` |
| `kestra/prod_flows/ai_concierge-schedule_service.yml` | Check all | `.vars.output` → `.vars.stdout` |
| `kestra/prod_flows/ai_concierge-notify_user.yml` | Check all | `.vars.output` → `.vars.stdout` |
| `kestra/flows/*.yaml` | Check all | `.vars.output` → `.vars.stdout` |

## Implementation Plan

### Phase 1: Scan and Identify
1. Search all Kestra YAML files for `.vars.output` pattern
2. Document all occurrences with file paths and line numbers

### Phase 2: Apply Fixes
1. Update `kestra/prod_flows/` files
2. Update `kestra/flows/` files
3. Verify no `.vars.output` references remain

### Phase 3: Verify
1. Validate YAML syntax
2. Test locally with Kestra Docker
3. Confirm outputs are captured correctly

## Testing Strategy

### Local Testing
```bash
# Start local Kestra
docker-compose up -d kestra

# Trigger test flow
curl -X POST http://localhost:8082/api/v1/executions/ai_concierge/contact_providers \
  -H "Content-Type: application/json" \
  -d '{"provider_phone": "+1234567890", "service_needed": "test"}'

# Check execution logs for output capture
```

### Validation Checklist
- [ ] All `.vars.output` replaced with `.vars.stdout`
- [ ] YAML files parse without errors
- [ ] Local Kestra execution succeeds
- [ ] Output values are captured correctly
- [ ] No regression in existing functionality

---

## Document Metadata

**Last Updated**: 2025-12-11
**Implementation Status**: In Progress
**Related Documents**:
- [Kestra Script Migration](../kestra_script_migration.md)
- [Kestra Workflow Migration](../kestra_workflow_migration.md)

**Change Log**:
- 2025-12-11 - Initial creation
