# Lessons Learned — Concierge AI

### Gemini 3.1 Live: enableAffectiveDialog and SIP settings are critical for voice quality
**Date**: 2026-04-01
**Issue**: Voice agent sounded robotic and had stuttering/pauses on initial call connect, despite using Gemini 3.1 Live which supports expressive audio.

#### Root Causes
1. **Robotic voice**: The `RealtimeModel` was created with only `model`, `voice`, and `temperature`. Missing `enableAffectiveDialog: true`, `proactivity: true`, and `apiVersion: "v1alpha"` — these are the flags that unlock Gemini 3.1's emotive, human-like voice.
2. **Initial stutter**: `krispEnabled` defaulted to `true` on SIP participant creation, causing Krisp noise cancellation warmup to clip the first 1-2 seconds. Additionally, `waitUntilAnswered` was `false`, so the agent started speaking before the call connected.

#### What to Avoid
- **DON'T**: Assume default RealtimeModel options give best quality — Gemini's expressiveness features are opt-in
- **DON'T**: Enable Krisp on outbound SIP calls — the warmup buffer clips initial audio
- **DON'T**: Set `waitUntilAnswered: false` — the greeting plays during SIP negotiation and gets cut off

#### Correct Approach
```typescript
// Voice quality: enable all expressiveness features
new google.beta.realtime.RealtimeModel({
  model: "gemini-3.1-flash-live-preview",
  voice: "Puck",
  temperature: 0.8,
  enableAffectiveDialog: true,  // mirrors emotional tone
  proactivity: true,            // enables back-channeling
  apiVersion: "v1alpha",        // required for affective dialog
})

// SIP: clean connect without artifacts
{
  krispEnabled: false,         // no warmup delay
  waitUntilAnswered: true,     // greeting waits for pickup
}
```

#### Quick Reference
- **Red Flag**: Voice sounds flat/robotic on Gemini Live → check `enableAffectiveDialog`
- **Red Flag**: First 1-2 seconds of call are garbled/cut off → check `krispEnabled` and `waitUntilAnswered`
- **Green Light**: Voice is warm and varied, call connects cleanly with no stutter
- **Validation**: Dispatch a test call and compare before/after
