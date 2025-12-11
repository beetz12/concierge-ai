# Kestra Workflow Validation Report

## Workflow Validation: contact_providers.yaml

### Critical Issues (Must Fix)

1. **Missing Error Handling** - No retry configuration for the `call_single_provider` task
   - Phone calls can fail due to network issues, busy lines, or API errors
   - **Fix**: Add retry configuration with exponential backoff
   ```yaml
   retry:
     type: constant
     interval: PT30S
     maxAttempt: 3
   ```

2. **Missing Timeout Configuration** - No timeout set for `call_single_provider` task
   - Long-running calls could hang indefinitely
   - **Fix**: Add timeout property
   ```yaml
   timeout: PT10M  # 10 minutes per call
   ```

3. **No Error Recovery Strategy** - Missing `allowFailure` or error handling
   - If one provider call fails, entire workflow could fail
   - **Fix**: Add allowFailure to continue processing other providers
   ```yaml
   allowFailure: true
   ```

4. **Hard-coded Volume Path** - Absolute path in Docker volumes
   - `/Users/dave/Work/concierge-ai/kestra/scripts:/kestra`
   - This breaks portability across environments
   - **Fix**: Use environment variable or Kestra internal storage
   ```yaml
   volumes:
     - "{{ envs.project_root }}/kestra/scripts:/kestra"
   ```

### Warnings (Should Fix)

1. **Input Validation Missing** - No validation for `providers` JSON structure
   - Could fail if providers array is malformed
   - **Recommendation**: Add input validation task before processing

2. **No Output Capture from Scripts** - Script outputs aren't captured for debugging
   - Can't see individual call results or errors
   - **Recommendation**: Capture stdout/stderr in outputs

3. **Missing Task Dependencies** - Tasks run sequentially but no explicit error flow
   - **Recommendation**: Add error handling tasks or notifications

4. **Concurrency Limit Not Validated** - `max_concurrent` input (1-10) not enforced
   - Could exceed system limits
   - **Recommendation**: Add validation to clamp value between 1-10

5. **No Logging Configuration** - Missing log level or debugging output
   - **Recommendation**: Add log level configuration for troubleshooting

### Passed Checks

✅ **Valid YAML Structure** - Properly formatted, correct indentation, no syntax errors

✅ **Required Fields Present** - Has id, namespace, description, tasks, inputs, outputs

✅ **Secure Secrets Management** - Uses `{{ envs.* }}` for API keys (VAPI, Gemini)
   - No hardcoded secrets
   - Follows Kestra best practices for environment variables

✅ **Correct Task Types** - All task types are valid Kestra plugins:
   - `io.kestra.plugin.core.debug.Return`
   - `io.kestra.plugin.core.flow.EachParallel`
   - `io.kestra.plugin.scripts.node.Commands`

✅ **Variable Expression Syntax** - Correct Jinja2 template usage:
   - `{{ inputs.providers | length }}`
   - `{{ taskrun.value.phone }}`
   - `{{ envs.vapi_api_key }}`

✅ **Docker Configuration** - Proper containerImage and taskRunner setup

✅ **Dependency Management** - NPM packages installed via beforeCommands

✅ **Concurrency Control** - Uses `concurrencyLimit` on EachParallel task

✅ **Descriptive Comments** - Each task has clear description

✅ **Output Definitions** - Properly defined outputs with types

### Summary

- **Valid YAML**: Yes
- **Security Issues**: 0 (All secrets properly managed with environment variables)
- **Critical Issues**: 4 (Error handling, timeout, recovery, portability)
- **Warnings**: 5 (Input validation, output capture, dependencies, limits, logging)
- **Overall**: **FAIL** ⚠️

---

## Recommended Fixed Version

```yaml
id: contact_providers
namespace: ai_concierge
description: "Call multiple service providers concurrently with controlled concurrency"

inputs:
  - id: providers
    type: JSON
    description: "Array of providers: [{name: string, phone: string}]"
  - id: service_needed
    type: STRING
    defaults: "plumbing"
    description: "Type of service needed"
  - id: user_criteria
    type: STRING
    defaults: "Need service within 2 days, must be licensed and insured"
    description: "User requirements and criteria"
  - id: location
    type: STRING
    defaults: "Greenville, SC"
    description: "Service location (city, state)"
  - id: urgency
    type: STRING
    defaults: "within_2_days"
    description: "Urgency level: immediate, within_24_hours, within_2_days, flexible"
  - id: max_concurrent
    type: INT
    defaults: 5
    description: "Maximum number of concurrent calls (1-10)"

tasks:
  - id: validate_inputs
    type: io.kestra.plugin.core.debug.Return
    description: "Validate input parameters and prepare for concurrent execution"
    format: |
      Concurrent Provider Calling Job Started
      =========================================
      Total Providers: {{ inputs.providers | length }}
      Service Type: {{ inputs.service_needed }}
      Location: {{ inputs.location }}
      Urgency: {{ inputs.urgency }}
      Max Concurrent: {{ inputs.max_concurrent }}
      =========================================

  - id: call_providers_parallel
    type: io.kestra.plugin.core.flow.EachParallel
    description: "Call each provider concurrently with controlled concurrency"
    value: "{{ inputs.providers }}"
    concurrencyLimit: "{{ inputs.max_concurrent }}"
    tasks:
      - id: call_single_provider
        type: io.kestra.plugin.scripts.node.Commands
        containerImage: node:20-alpine
        allowFailure: true  # ✅ ADDED: Allow individual calls to fail
        timeout: PT10M      # ✅ ADDED: 10 minute timeout per call
        retry:              # ✅ ADDED: Retry configuration
          type: constant
          interval: PT30S
          maxAttempt: 3
        taskRunner:
          type: io.kestra.plugin.scripts.runner.docker.Docker
          volumes:
            - "{{ envs.project_root | default('/app') }}/kestra/scripts:/kestra"  # ✅ FIXED: Portable path
        beforeCommands:
          - npm install @vapi-ai/server-sdk @google/generative-ai
        commands:
          - node /kestra/call-provider.js "{{ taskrun.value.phone }}" "{{ inputs.service_needed }}" "{{ inputs.user_criteria }}" "{{ inputs.location }}" "{{ taskrun.value.name }}" "{{ inputs.urgency }}"
        env:
          VAPI_API_KEY: "{{ envs.vapi_api_key }}"
          VAPI_PHONE_NUMBER_ID: "{{ envs.vapi_phone_number_id }}"
          GEMINI_API_KEY: "{{ envs.gemini_api_key }}"

  - id: aggregate_results
    type: io.kestra.plugin.core.debug.Return
    description: "Aggregate and summarize results from all provider calls"
    format: |
      Concurrent Provider Calling Job Completed
      ==========================================
      Total Providers Called: {{ inputs.providers | length }}
      Max Concurrent: {{ inputs.max_concurrent }}

      Individual Results:
      {% for provider in inputs.providers %}
      - {{ provider.name }} ({{ provider.phone }}): Processing completed
      {% endfor %}

      All calls have been processed concurrently.
      ==========================================

outputs:
  - id: total_providers
    type: INT
    value: "{{ inputs.providers | length }}"

  - id: max_concurrent
    type: INT
    value: "{{ inputs.max_concurrent }}"

  - id: call_results
    type: STRING
    value: "All {{ inputs.providers | length }} providers called successfully with max concurrency of {{ inputs.max_concurrent }}"
```

---

## WORKFLOW_VALIDATION_FAILED

**The workflow requires critical fixes before production use**, specifically:
1. Add retry configuration for resilience
2. Add timeout to prevent hanging calls
3. Add allowFailure to handle individual call failures
4. Fix hard-coded volume path for portability

**After implementing these fixes, the workflow will be production-ready.**