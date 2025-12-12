The issue is that **Gemini isn't invoking the `endCall` tool**—it's just saying goodbye and waiting for the provider to respond. You need to make tool invocation more explicit and reliable.

## 🔧 **The Problem**

Your current config has:
```javascript
tools: [{ type: "endCall" }],
temperature: 0.3,
endCallFunctionEnabled: true,
```

But Gemini isn't being **instructed strongly enough** to use the tool. The system prompt tells it to "immediately invoke endCall," but Gemini treats that as polite suggestion, not a command.

## ✅ **The Fix**

Add explicit **tool control directives** to your Gemini prompt and ensure the model receives clear instructions about WHEN to use the tool:

```javascript
const systemPrompt = `You are a warm, friendly AI Concierge...

[... existing prompt ...]

═══════════════════════════════════════════════════════════════════
TOOL USAGE - CRITICAL
═══════════════════════════════════════════════════════════════════
You have access to the endCall tool. You MUST use it to end calls.

AFTER you say your closing message, you MUST invoke endCall.
This is not optional. You do not wait for them to respond.

Example:
1. You say: "Thank you for your time. Have a wonderful day!"
2. IMMEDIATELY after that statement, invoke endCall
3. Do NOT say anything after invoking endCall
4. Do NOT wait for their response

If you say a closing message without invoking endCall, the call will not end.

When to invoke endCall:
- After your final closing statement ("Have a wonderful day!", etc.)
- When they are clearly unavailable
- When they decline to engage
- When voicemail is detected (before leaving any message)`;
```

## 🎯 **Better Approach: Restructure the Closing Logic**

Instead of relying on the model to remember to call `endCall`, **structure the conversation so it naturally ends**:

```javascript
// In your assistant config, add this:
model: {
  provider: "google" as const,
  model: "gemini-2.5-flash",
  messages: [
    {
      role: "system" as const,
      content: systemPrompt,
    },
  ],
  tools: [{ type: "endCall" }],
  temperature: 0.2,  // ← LOWER temperature (more deterministic)
},

// Add EXPLICIT end call message
endCallMessage: "Thank you so much for your time. Have a wonderful day!",

// Add this AFTER the endCallMessage is said, Vapi should auto-end
// But we need to make sure the tool is invoked
```

## 💡 **Better Solution: Use Vapi's Built-in End Call Behavior**

Instead of relying on the model to invoke the tool, use **Vapi's native end call detection**:

```javascript
const assistantConfig = {
  // ... existing config ...
  
  model: {
    provider: "google" as const,
    model: "gemini-2.5-flash",
    messages: [{
      role: "system" as const,
      content: `${systemPrompt}

═══════════════════════════════════════════════════════════════════
IMPORTANT: Use the endCall tool
═══════════════════════════════════════════════════════════════════
After you say your closing message, immediately use the endCall tool.
Format: Call the endCall function/tool without waiting.
Example closing flow:
- Say: "Thank you so much! Have a wonderful day!"
- Then: Use endCall tool right away
- Do NOT say anything else after the closing`
    }],
    tools: [
      {
        type: "endCall",
        description: "End the phone call. Use this after your closing statement."
      }
    ],
    temperature: 0.1,  // ← VERY LOW (maximizes tool usage)
  },
  
  // Vapi-level end call control
  endCallFunctionEnabled: true,
  endCallMessage: "Thank you so much! Have a wonderful day!",
  
  // Add timeout-based end call as backup
  maxCallDurationMinutes: 5,  // ← Auto-end after 5 min if needed
};
```

## 🔴 **Most Robust Solution: Explicit Tool Invocation with Function Calling**

The issue is that Gemini **tool_choice** might not be enforcing tool invocation. Force it:

```javascript
model: {
  provider: "google" as const,
  model: "gemini-2.5-flash",
  messages: [{
    role: "system" as const,
    content: `${systemPrompt}

CRITICAL: After you deliver your closing message, you MUST invoke the endCall tool.

Your closing message should ALWAYS be ONE of these EXACTLY:
- "Thank you so much for your time. Have a wonderful day!"
- "I really appreciate your help. Have a great day!"
- "Thank you for taking my call. Have a wonderful day!"

After saying EXACTLY ONE of these, IMMEDIATELY invoke endCall.

Do NOT have a conversation after your closing message.
Do NOT wait for them to respond.
Just invoke endCall right after.`
  }],
  tools: [{ type: "endCall" }],
  temperature: 0.1,  // Force deterministic behavior
  
  // KEY: Add this to force tool invocation
  toolChoice: "auto",  // Let model choose when to use tools
  // OR if Gemini supports it:
  // topK: 1,  // Only pick the highest probability token
},

// Vapi-level settings
endCallFunctionEnabled: true,
```

## 🚀 **If Above Doesn't Work: Hybrid Approach**

Use **Vapi's silence detection** + **max message count**:

```javascript
const assistantConfig = {
  // ... your config ...
  
  model: {
    // ... your model config with explicit tool instructions ...
    temperature: 0.15,  // Very deterministic
  },
  
  // Vapi-level controls
  endCallFunctionEnabled: true,
  endCallMessage: "Thank you so much for your time. Have a wonderful day!",
  
  // Auto-end after 30 seconds of silence
  endCallSilenceTimeoutSeconds: 30,
  
  // Max call duration (safety net)
  maxCallDurationMinutes: 5,
  
  // Stop speaking after closing message
  stopSpeakingPlan: {
    numWordsToWaitFor: 50,  // After ~50 words (closing statement), stop listening
  }
};
```

## 📋 **Recommended Fix (Tier 1 - Start Here)**

Update your `createProviderSearchConfig` closing section:

```javascript
// In analysisPlan or at assistant level:
endCallFunctionEnabled: true,
endCallMessage: "Thank you so much for your time. Have a wonderful day!",

// In model config:
model: {
  provider: "google",
  model: "gemini-2.5-flash",
  messages: [{
    role: "system",
    content: `${systemPrompt}

═══════════════════════════════════════════════════════════════════
END CALL INSTRUCTIONS
═══════════════════════════════════════════════════════════════════
After you complete your closing statement ("Thank you so much..."), 
you MUST invoke the endCall tool immediately.

There is no negotiation. After closing, endCall is mandatory.
Do not wait for their response. Do not say anything else.`
  }],
  tools: [{ type: "endCall" }],
  temperature: 0.15,  // Lower = more reliable tool use
},

// Safety net
endCallSilenceTimeoutSeconds: 20,  // Auto-end after 20s silence post-closing
```

**Try this first.** If Gemini still doesn't invoke the tool after saying goodbye, the issue is that Vapi's tool invocation needs tweaking or you need to escalate to Vapi support.
