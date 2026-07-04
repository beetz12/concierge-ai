import assert from "node:assert/strict";
import test from "node:test";
import { generatePromptFromAnalysis, buildDisclosureLine } from "./prompt-generator.js";
import type {
  AnalyzeDirectTaskRequest,
  StrategicGuidance,
  TaskAnalysis,
} from "./types.js";

const guidance: StrategicGuidance = {
  keyGoals: ["Get the double charge reversed", "Capture a credit reference number"],
  talkingPoints: ["The statement shows two charges of $59.99 on the same day"],
  objectionHandlers: {
    "We can only offer a credit": "A credit works if it posts this cycle - can you confirm the date?",
  },
  successCriteria: ["Refund or credit confirmed with a reference number"],
};

const refundAnalysis: TaskAnalysis = {
  taskType: "request_refund",
  intent: "Get a duplicate charge refunded",
  difficulty: "moderate",
};

const baseRequest: AnalyzeDirectTaskRequest = {
  taskDescription: "Request a refund for a duplicate charge on the account",
  contactName: "Acme Cable",
  clientName: "Weiwei",
};

test("disclosure line follows the legitimacy-led order with the templated customer name", () => {
  const line = buildDisclosureLine("Weiwei", "request_refund");
  // (1) identity + plain AI disclosure first
  assert.ok(line.startsWith("Hi there - I'm Weiwei's AI assistant"), line);
  // (3) recording aside
  assert.match(line, /this call is recorded/);
  // (4) permission ask
  assert.match(line, /got a quick minute\?/);
});

test("generated prompt carries the disclosureLine field and uses it as the first message", () => {
  const prompt = generatePromptFromAnalysis(baseRequest, refundAnalysis, guidance);
  assert.ok(prompt.disclosureLine, "disclosureLine must always be set");
  assert.ok(prompt.disclosureLine.includes("Weiwei's AI assistant"));
  assert.equal(prompt.firstMessage, prompt.disclosureLine);
  assert.ok(prompt.systemPrompt.includes(prompt.disclosureLine));
});

test("opener hook is category-only, never the detailed ask", () => {
  const prompt = generatePromptFromAnalysis(baseRequest, refundAnalysis, guidance);
  assert.doesNotMatch(
    prompt.firstMessage,
    /duplicate charge/i,
    "the detailed ask leaked into the opener"
  );
});

test("customer name is templated, never hardcoded personal facts", () => {
  const prompt = generatePromptFromAnalysis(
    {
      taskDescription: "Deliver a thank-you message to the office",
      contactName: "Front Desk",
      clientName: "Priya",
    },
    { taskType: "deliver_message", intent: "Deliver a message", difficulty: "easy" },
    guidance
  );
  const everything = [
    prompt.systemPrompt,
    prompt.firstMessage,
    prompt.closingScript ?? "",
  ].join("\n");
  assert.match(everything, /Priya/);
  assert.doesNotMatch(everything, /\bDavid\b/);
  assert.doesNotMatch(everything, /\bJarvis\b/);
  assert.doesNotMatch(everything, /\bGreenville\b/);
});

test("missing clientName degrades to a generic customer, still disclosure-led", () => {
  const prompt = generatePromptFromAnalysis(
    { taskDescription: "Ask about store hours", contactName: "Acme Store" },
    { taskType: "make_inquiry", intent: "Get store hours", difficulty: "easy" },
    guidance
  );
  assert.ok(prompt.disclosureLine, "disclosureLine must always be set");
  assert.ok(prompt.disclosureLine.startsWith("Hi there - I'm the customer's AI assistant"));
  assert.doesNotMatch(prompt.systemPrompt, /\bDavid\b/);
});

test("system prompt composes core floor + commitment whitelist", () => {
  const prompt = generatePromptFromAnalysis(baseRequest, refundAnalysis, guidance);
  assert.match(prompt.systemPrompt, /COMMITMENT WHITELIST/);
  assert.match(prompt.systemPrompt, /NEVER keyword-match the objective text/);
  assert.match(prompt.systemPrompt, /UNIVERSAL BEHAVIOR FLOOR/);
  assert.match(prompt.systemPrompt, /never claim to be human/i);
});

test("selected playbook substance lands in the prompt (disputes for refunds)", () => {
  const prompt = generatePromptFromAnalysis(baseRequest, refundAnalysis, guidance);
  assert.match(prompt.systemPrompt, /SCENARIO QUESTION BATTERIES/);
  assert.match(prompt.systemPrompt, /walk me through exactly how you arrived at that amount/i);
  // Playbook success criteria merge with the strategic guidance criteria.
  assert.match(prompt.systemPrompt, /reference\/case number/i);
});

test("contractor-vetting description pulls the contractors battery into the prompt", () => {
  const prompt = generatePromptFromAnalysis(
    {
      taskDescription: "Vet a plumber and get a repair quote",
      contactName: "Ace Plumbing",
      clientName: "Weiwei",
    },
    { taskType: "make_inquiry", intent: "Vet the provider", difficulty: "moderate" },
    guidance
  );
  assert.match(prompt.systemPrompt, /diagnostic \/ service-call fee/);
  assert.match(prompt.systemPrompt, /DISQUALIFIERS/);
});

test("pre-authorizations are EXCLUDED from the prompt when not granted", () => {
  const prompt = generatePromptFromAnalysis(baseRequest, refundAnalysis, guidance);
  // Disputes pre-auths exist but none were granted.
  assert.ok(prompt.preAuthorizations, "preAuthorizations echo must always be set");
  assert.ok(prompt.preAuthorizations.length >= 2);
  assert.ok(prompt.preAuthorizations.every((a) => a.granted === false));
  assert.match(prompt.systemPrompt, /NONE granted for this call/);
  assert.doesNotMatch(prompt.systemPrompt, /explicitly granted for this call ONLY/);
  assert.doesNotMatch(prompt.systemPrompt, /cancel_if_needed/);
  assert.doesNotMatch(prompt.systemPrompt, /Approved phrasing:/);
});

test("explicitly granted pre-authorizations are included and echoed as granted", () => {
  const prompt = generatePromptFromAnalysis(
    { ...baseRequest, grantedPreAuthorizations: ["cancel_if_needed"] },
    refundAnalysis,
    guidance
  );
  assert.ok(prompt.preAuthorizations, "preAuthorizations echo must always be set");
  const cancelAuth = prompt.preAuthorizations.find((a) => a.key === "cancel_if_needed");
  assert.ok(cancelAuth);
  assert.equal(cancelAuth.granted, true);
  assert.match(prompt.systemPrompt, /explicitly granted for this call ONLY/);
  assert.match(prompt.systemPrompt, /cancel_if_needed/);
  // The other, ungranted pre-auth stays out of the prompt but in the echo.
  const chargeback = prompt.preAuthorizations.find(
    (a) => a.key === "chargeback_or_regulator"
  );
  assert.ok(chargeback);
  assert.equal(chargeback.granted, false);
  assert.doesNotMatch(prompt.systemPrompt, /chargeback_or_regulator/);
});

test("core-only tasks carry no scenario battery but keep the floor and empty echo", () => {
  const prompt = generatePromptFromAnalysis(
    { taskDescription: "Handle a small everyday request", contactName: "Local Shop" },
    { taskType: "general_task", intent: "Complete the task", difficulty: "easy" },
    guidance
  );
  assert.doesNotMatch(prompt.systemPrompt, /SCENARIO QUESTION BATTERIES/);
  assert.match(prompt.systemPrompt, /UNIVERSAL BEHAVIOR FLOOR/);
  assert.deepEqual(prompt.preAuthorizations, []);
});

test("scheduling keeps the specific date-and-time enforcement", () => {
  const prompt = generatePromptFromAnalysis(
    {
      taskDescription: "Set up a service visit for the customer",
      contactName: "Acme Services",
      clientName: "Weiwei",
    },
    { taskType: "schedule_appointment", intent: "Book a visit", difficulty: "easy" },
    guidance
  );
  assert.match(prompt.systemPrompt, /SPECIFIC DATE AND TIME REQUIRED/);
  assert.match(prompt.systemPrompt, /Which specific day would that be\?/);
  assert.match(prompt.systemPrompt, /DO NOT accept vague timeframes/);
});

test("generated prompts are ASCII-only", () => {
  const prompt = generatePromptFromAnalysis(baseRequest, refundAnalysis, guidance);
  const everything = [
    prompt.systemPrompt,
    prompt.firstMessage,
    prompt.closingScript ?? "",
    prompt.disclosureLine ?? "",
  ].join("\n");
  assert.doesNotMatch(everything, /[^\x00-\x7F]/);
});
