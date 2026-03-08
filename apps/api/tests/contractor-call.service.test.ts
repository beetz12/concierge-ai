import assert from "node:assert/strict";
import test from "node:test";
import {
  ContractorCallService,
  createCriteriaSummary,
  getVoiceAgentDispatchPath,
} from "../src/services/voice/contractor-call.service.js";

const mockSupabase = {
  from() {
    throw new Error("Supabase should not be called in these unit tests");
  },
} as never;

test("createCriteriaSummary includes must-ask questions, deal breakers, and intake answers", () => {
  const summary = createCriteriaSummary({
    mode: "qualification",
    contractorName: "Acme Lawn",
    contractorPhone: "+18035550123",
    serviceNeeded: "lawn service",
    location: "Greenville, SC",
    userCriteria: "Needs recurring mowing and edging.",
    mustAskQuestions: ["Do you handle weekly mowing?"],
    dealBreakers: ["No proof of insurance"],
    intakeAnswers: [
      {
        questionId: "yard-size",
        question: "How large is the yard?",
        answer: "About half an acre",
      },
    ],
    additionalNotes: "Customer prefers Tuesday mornings.",
  });

  assert.match(summary, /Needs recurring mowing and edging\./);
  assert.match(summary, /Must ask: Do you handle weekly mowing\?/);
  assert.match(summary, /Deal breakers: No proof of insurance/);
  assert.match(summary, /How large is the yard\?: About half an acre/);
  assert.match(summary, /Customer prefers Tuesday mornings\./);
});

test("getVoiceAgentDispatchPath maps each call mode to the correct route", () => {
  assert.equal(getVoiceAgentDispatchPath("qualification"), "/dispatch/provider-call");
  assert.equal(getVoiceAgentDispatchPath("booking"), "/dispatch/provider-booking");
  assert.equal(getVoiceAgentDispatchPath("direct_task"), "/dispatch/direct-task");
});

test("ContractorCallService builds a qualification plan using research analysis output", async () => {
  const service = new ContractorCallService({
    supabase: mockSupabase,
    analyzeResearchPromptImpl: async () => ({
      serviceCategory: "home_service",
      terminology: {
        providerTerm: "contractor",
        appointmentTerm: "visit",
        visitDirection: "provider comes to location",
      },
      contextualQuestions: ["Do you offer weekly mowing?"],
      systemPrompt: "Ask about service scope and availability.",
      firstMessage: "I’m calling on behalf of a client about lawn service.",
      closingScript: "Thank you. I’ll report back to the client.",
    }),
  });

  const plan = await service.buildCallPlan({
    mode: "qualification",
    contractorName: "Acme Lawn",
    contractorPhone: "+18035550123",
    serviceNeeded: "lawn service",
    location: "Greenville, SC",
    userCriteria: "Needs recurring service.",
    clientName: "Dave",
    mustAskQuestions: ["Are you insured?"],
  });

  assert.equal(plan.promptSource, "research_analysis");
  assert.equal(plan.previewMetadata.kind, "qualification");
  assert.equal(plan.previewMetadata.customPrompt?.firstMessage, "I’m calling on behalf of a client about lawn service.");
  assert.deepEqual(plan.previewMetadata.mustAskQuestions, ["Are you insured?"]);
  assert.deepEqual(plan.generatedPrompt?.contextualQuestions, ["Do you offer weekly mowing?"]);
});

test("ContractorCallService builds a direct-task plan using task analysis output", async () => {
  const service = new ContractorCallService({
    supabase: mockSupabase,
    analyzeDirectTaskImpl: async () => ({
      taskAnalysis: {
        taskType: "make_inquiry",
        intent: "Ask about seasonal cleanup packages.",
        difficulty: "easy",
      },
      strategicGuidance: {
        keyGoals: ["Get package details"],
        talkingPoints: ["Ask what is included."],
        objectionHandlers: {},
        successCriteria: ["Package details captured"],
      },
      generatedPrompt: {
        systemPrompt: "Ask about seasonal cleanup packages.",
        firstMessage: "I’m calling on behalf of my client with a quick question.",
        closingScript: "Thanks for the information.",
      },
    }),
  });

  const plan = await service.buildCallPlan({
    mode: "direct_task",
    contractorName: "Acme Lawn",
    contractorPhone: "+18035550123",
    serviceNeeded: "seasonal cleanup",
    location: "Greenville, SC",
    taskDescription: "Find out whether they offer fall cleanup packages.",
  });

  assert.equal(plan.promptSource, "direct_task_analysis");
  assert.equal(plan.directTaskType, "make_inquiry");
  assert.equal(plan.previewMetadata.directTaskType, "make_inquiry");
  assert.equal(plan.previewMetadata.customPrompt?.systemPrompt, "Ask about seasonal cleanup packages.");
});
