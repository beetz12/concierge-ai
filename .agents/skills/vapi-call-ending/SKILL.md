---
name: vapi-call-ending
description: Diagnose and fix VAPI agent call ending issues - premature cutoffs, delayed endings, silenceTimeoutSeconds errors, turn-taking problems
---

# VAPI Call Ending Skill

Diagnose and fix VAPI voice agent call ending issues in the AI Concierge application. This skill captures the two failure modes, root causes, and proven fixes.

## When to Use

- Agent cuts off provider mid-sentence (ends call too early)
- Agent waits too long after saying goodbye before ending call
- VAPI API returns validation errors about `silenceTimeoutSeconds`
- Call endings feel unnatural or awkward
- Transcript shows endCall triggered at wrong time

## Quick Diagnosis

| Symptom | Root Cause | Fix |
|---------|------------|-----|
| Provider cut off mid-sentence (e.g., "$100..." then call ends before "...for emergency") | Aggressive `IMMEDIATELY invoke endCall` instructions | Change to: end immediately AFTER farewell only |
| 10-15 seconds of silence after "Have a wonderful day" before call ends | Compound waits: "wait for acknowledgment" + "wait 2-3 seconds" with no timeout | Remove acknowledgment waiting; end immediately after farewell |
| `silenceTimeoutSeconds must not be less than 10` error | Value set below VAPI minimum | Set to `10` or higher |
| Agent says goodbye AFTER endCall triggered | endCall invoked before farewell message | Ensure farewell is spoken, THEN endCall |

---

## The Two Failure Modes

### Mode 1: TOO AGGRESSIVE (Cuts Off Provider)

**Transcript Pattern:**
```
+00:32.52  Provider: "I charge hundred dollars"
+00:34.60  EndCall triggered (2 seconds later!)
+00:35.21  Provider: "For emergency" (AFTER call ended - cut off!)
```

**Root Causes:**
- Instructions say `IMMEDIATELY invoke endCall. DO NOT wait for their response`
- Temperature too low (0.15) - makes Gemini too deterministic
- No distinction between "gathering info" phase vs "after farewell" phase

**Bad Prompt Pattern:**
```
Then IMMEDIATELY use the endCall tool. DO NOT wait for their response.
DO NOT say "goodbye" - just invoke endCall right after your closing statement.
```

### Mode 2: TOO PASSIVE (Waits Too Long)

**Transcript Pattern:**
```
+00:52.12  Agent: "Have a wonderful day."
           [13 SECONDS OF AWKWARD SILENCE]
+01:05.52  EndCall triggered
+01:06.17  Provider: "Okay." (finally responds)
```

**Root Causes:**
- Instructions say `WAIT for acknowledgment` with no timeout
- Compound waits: "wait for ack" + "wait 2-3 more seconds"
- Agent interprets as "wait indefinitely until they respond"
- Falls back to `silenceTimeoutSeconds` (20s) instead of ending promptly

**Bad Prompt Pattern:**
```
STEP 2 - WAIT FOR ACKNOWLEDGMENT:
Listen for their response. They will say "yes", "sounds good"...
Wait for a clear pause (2-3 seconds of silence).

STEP 4 - FINAL PAUSE:
Wait 2 seconds to ensure they don't have any final words.
```

---

## The Correct Pattern

**Simple Rule:**
```
WHILE GATHERING INFO:  Let provider finish speaking (don't cut off mid-sentence)
AFTER FAREWELL:        IMMEDIATELY invoke endCall (no waiting)
```

**Correct Prompt:**
```
WHILE GATHERING INFORMATION (before farewell):
- If provider is mid-sentence, let them finish
- If they mention a price, wait for full context (e.g., "$100... for emergency work")
- Don't cut them off while they're giving you information

AFTER YOUR FAREWELL ("Have a wonderful day!"):
- IMMEDIATELY invoke endCall - do not wait for any response
- Do not wait for acknowledgment
- Do not add pauses
```

---

## VAPI Configuration Constraints

### silenceTimeoutSeconds

**Constraint:** VAPI requires minimum value of `10` seconds.

**Error if violated:**
```json
{
  "message": ["assistant.silenceTimeoutSeconds must not be less than 10"],
  "error": "Bad Request",
  "statusCode": 400
}
```

**Correct Configuration:**
```typescript
silenceTimeoutSeconds: 10,  // VAPI minimum is 10s; agent should invoke endCall immediately after farewell
```

**Purpose:** Safety net only - the agent should invoke endCall immediately after farewell, so this timeout should never actually trigger.

### Temperature Setting

**Recommended:** `0.35` for balanced turn-taking

| Temperature | Behavior | Use Case |
|-------------|----------|----------|
| 0.10-0.15 | Very deterministic, fast tool invocation | May cut off mid-sentence |
| 0.35 | Balanced: reliable tool calls + natural conversation | Recommended |
| 0.5+ | More creative, less predictable | Not recommended for tool use |

---

## Key File

**Primary Configuration:** `apps/api/src/services/vapi/assistant-config.ts`

Contains three config functions that ALL need consistent call-ending logic:
1. `createDirectTaskConfig()` - Direct Task calls (complain, negotiate, etc.)
2. `createDynamicDirectTaskConfig()` - Dynamic prompts for Direct Tasks
3. `createProviderSearchConfig()` - Research & Book calls (provider search)

Each has:
- System prompt with ENDING THE CALL section
- `silenceTimeoutSeconds` setting
- `temperature` setting

---

## Fix Checklist

When fixing call ending issues:

- [ ] Remove all `IMMEDIATELY invoke endCall` from BEFORE farewell
- [ ] Add `IMMEDIATELY invoke endCall` AFTER farewell only
- [ ] Remove compound waits (no "wait for ack + wait 2-3s")
- [ ] Remove "wait for acknowledgment" requirements
- [ ] Keep "let them finish" only for DURING information gathering
- [ ] Verify `silenceTimeoutSeconds >= 10`
- [ ] Temperature set to `0.35` for balanced behavior
- [ ] All three config functions have consistent logic

---

## Debugging Steps

1. **Get the transcript** - Check timestamps to see when endCall triggered vs when provider spoke

2. **Identify the mode:**
   - endCall within 2-3 seconds of provider speaking → TOO AGGRESSIVE
   - endCall 10+ seconds after agent farewell → TOO PASSIVE

3. **Check the prompt sections:**
   ```bash
   grep -n "ENDING THE CALL\|IMMEDIATELY\|WAIT for\|endCall" apps/api/src/services/vapi/assistant-config.ts
   ```

4. **Check silenceTimeoutSeconds:**
   ```bash
   grep -n "silenceTimeoutSeconds" apps/api/src/services/vapi/assistant-config.ts
   ```

5. **Apply the correct pattern** (see above)

6. **Rebuild and test:**
   ```bash
   pnpm build
   pnpm --filter api dev
   ```

---

## Example Fix Diff

**From (TOO AGGRESSIVE):**
```
Say: "Have a wonderful day!"
Then IMMEDIATELY invoke endCall. DO NOT wait for their response.
```

**To (CORRECT):**
```
WHILE GATHERING INFORMATION (before farewell):
- If provider is mid-sentence, let them finish
- Don't cut them off while speaking about prices, availability, etc.

AFTER YOUR FAREWELL ("Have a wonderful day!"):
- IMMEDIATELY invoke endCall - do not wait for any response
- Do not wait for acknowledgment
- Do not add pauses
```

The key insight: The timing of `IMMEDIATELY` matters. It should be AFTER the farewell, not BEFORE.
