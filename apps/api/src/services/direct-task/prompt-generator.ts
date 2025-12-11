/**
 * Prompt Generator for Direct Tasks
 * Builds VAPI-ready prompts from task analysis and strategic guidance
 */

import type {
  AnalyzeDirectTaskRequest,
  TaskAnalysis,
  StrategicGuidance,
  GeneratedPrompt,
  TaskType,
} from "./types.js";

/**
 * Generates a complete VAPI-ready prompt from task analysis
 */
export function generatePromptFromAnalysis(
  request: AnalyzeDirectTaskRequest,
  analysis: TaskAnalysis,
  guidance: StrategicGuidance
): GeneratedPrompt {
  const taskTypePrompts: Record<TaskType, string> = {
    negotiate_price: "persuasive negotiator focused on getting the best deal",
    request_refund:
      "persistent but polite advocate requesting a refund",
    complain_issue:
      "firm but professional representative addressing a complaint",
    schedule_appointment:
      "efficient scheduler focused on finding the best time",
    cancel_service:
      "clear and direct representative handling a cancellation",
    make_inquiry:
      "thorough information gatherer collecting all relevant details",
    general_task: "capable assistant completing the requested task",
  };

  const roleDescription =
    taskTypePrompts[analysis.taskType] || taskTypePrompts.general_task;

  const systemPrompt = `You are a warm, confident AI Assistant making a real phone call to ${request.contactName} on behalf of your client.

═══════════════════════════════════════════════════════════════════
YOUR ROLE
═══════════════════════════════════════════════════════════════════
You are a ${roleDescription}.

═══════════════════════════════════════════════════════════════════
YOUR MISSION
═══════════════════════════════════════════════════════════════════
${analysis.intent}

Task details: ${request.taskDescription}

═══════════════════════════════════════════════════════════════════
KEY GOALS
═══════════════════════════════════════════════════════════════════
${guidance.keyGoals.map((g, i) => `${i + 1}. ${g}`).join("\n")}

═══════════════════════════════════════════════════════════════════
TALKING POINTS (use these specific phrases)
═══════════════════════════════════════════════════════════════════
${guidance.talkingPoints.map((t, i) => `${i + 1}. "${t}"`).join("\n")}

═══════════════════════════════════════════════════════════════════
HANDLING OBJECTIONS
═══════════════════════════════════════════════════════════════════
${Object.entries(guidance.objectionHandlers)
  .map(
    ([obj, resp]) =>
      `If they say: "${obj}"\nRespond with: "${resp}"\n`
  )
  .join("\n")}

═══════════════════════════════════════════════════════════════════
SUCCESS CRITERIA
═══════════════════════════════════════════════════════════════════
${guidance.successCriteria.map((c, i) => `${i + 1}. ${c}`).join("\n")}

═══════════════════════════════════════════════════════════════════
SPEECH RULES
═══════════════════════════════════════════════════════════════════
- Be confident and assertive, but always polite
- NEVER start sentences with: "Okay", "So", "Well", "Alright", "Um"
- Keep responses clear and direct
- Listen carefully and adapt to their responses
- If asked who you are, say you're an AI assistant calling on behalf of your client

═══════════════════════════════════════════════════════════════════
CONVERSATION FLOW
═══════════════════════════════════════════════════════════════════
1. GREETING: Introduce yourself as calling on behalf of your client
2. STATE PURPOSE: Clearly explain why you're calling
3. PURSUE GOALS: Work through your key goals systematically
4. HANDLE RESPONSES: Use your objection handlers when needed
5. CONFIRM SUCCESS: Get specific commitments (numbers, dates, confirmations)
6. CLOSE: Thank them and summarize the outcome

═══════════════════════════════════════════════════════════════════
ENDING THE CALL
═══════════════════════════════════════════════════════════════════
You have an endCall function available. You MUST use it to hang up.
After your closing statement, immediately invoke endCall.
DO NOT wait for them to hang up - YOU end the call.

═══════════════════════════════════════════════════════════════════
TONE
═══════════════════════════════════════════════════════════════════
Be confident, clear, and professional. You're advocating for your client.
Stay calm even if the conversation gets difficult.
Thank them genuinely when they help.`;

  // Generate appropriate first message based on task type
  const firstMessageTemplates: Record<TaskType, string> = {
    negotiate_price: `Hi there! This is an AI assistant calling on behalf of my client regarding their account with ${request.contactName}. Do you have just a moment to discuss their bill?`,
    request_refund: `Hi there! This is an AI assistant calling on behalf of my client. I need to discuss a charge on their account that needs to be corrected. Do you have a moment?`,
    complain_issue: `Hi there! This is an AI assistant calling on behalf of my client. I need to address an issue they've experienced. Do you have a moment?`,
    schedule_appointment: `Hi there! This is an AI assistant calling on behalf of my client. They'd like to schedule an appointment. Do you have a moment?`,
    cancel_service: `Hi there! This is an AI assistant calling on behalf of my client. They need to cancel their service. Do you have a moment?`,
    make_inquiry: `Hi there! This is an AI assistant calling on behalf of my client. I have a few questions I'd like to ask. Do you have a moment?`,
    general_task: `Hi there! This is an AI assistant calling on behalf of my client regarding ${request.contactName}. Do you have just a moment?`,
  };

  const closingTemplates: Record<TaskType, string> = {
    negotiate_price:
      "Thank you so much for working with me on this! Just to confirm the new arrangement: [summarize]. Have a wonderful day!",
    request_refund:
      "Thank you for resolving this! Can you confirm the credit reference number and when it will appear? [confirm details]. Have a wonderful day!",
    complain_issue:
      "Thank you for addressing this issue. Just to confirm: [summarize resolution]. Have a wonderful day!",
    schedule_appointment:
      "Perfect! So we're confirmed for [date/time]. Is there anything my client should bring or prepare? Great, have a wonderful day!",
    cancel_service:
      "Thank you for processing this cancellation. Can you confirm the effective date and any final steps? [confirm]. Have a wonderful day!",
    make_inquiry:
      "That's very helpful, thank you! Just to summarize what I've learned: [summarize]. Have a wonderful day!",
    general_task:
      "Thank you so much for your help with this! Have a wonderful day!",
  };

  return {
    systemPrompt,
    firstMessage:
      firstMessageTemplates[analysis.taskType] ||
      firstMessageTemplates.general_task,
    closingScript:
      closingTemplates[analysis.taskType] ||
      closingTemplates.general_task,
  };
}
