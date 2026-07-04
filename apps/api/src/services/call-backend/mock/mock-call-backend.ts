import { randomUUID } from "node:crypto";
import type {
  CallArtifacts,
  CallBackend,
  CallBackendCapabilities,
  CallPlan,
  CallStatus,
} from "../types.js";

/**
 * Deterministic in-memory CallBackend for tests and demos
 * (`CALL_BACKEND=mock`).
 *
 * - No network, no credentials, no persistence.
 * - Status transitions are poll-count based: the first `getStatus` poll
 *   reports `in_progress`, every later poll reports the terminal state.
 * - The terminal disposition is selected by the LAST DIGIT of the dialed
 *   number so tests can script outcomes:
 *     ...2 -> voicemail   (state completed, message left)
 *     ...3 -> no_answer   (state failed)
 *     ...4 -> error       (state failed)
 *     anything else -> completed
 * - Artifacts are canned: a tiny silent WAV data URI, a synthesized
 *   transcript, and a structured outcome echoing the plan's must-ask
 *   questions with canned answers plus fixed cost/duration figures.
 */

const US_E164_REGEX = /^\+1\d{10}$/;

export type MockDisposition = "completed" | "voicemail" | "no_answer" | "error";

interface MockCallEntry {
  plan: CallPlan;
  polls: number;
  cancelled: boolean;
}

const CANNED_ANSWERS = [
  "Yes, we can take care of that.",
  "That would be 85 dollars, flat rate.",
  "The earliest opening is Tuesday at 2 PM.",
  "Yes, we are licensed and insured.",
  "About two weeks lead time right now.",
];

/** Minimal valid 8 kHz 16-bit mono WAV (quarter second of silence). */
function buildSilentWavDataUri(): string {
  const sampleRate = 8000;
  const numSamples = sampleRate / 4;
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16); // PCM chunk size
  buffer.writeUInt16LE(1, 20); // PCM format
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);
  return `data:audio/wav;base64,${buffer.toString("base64")}`;
}

export const MOCK_RECORDING_DATA_URI = buildSilentWavDataUri();

export function mockDispositionFor(phoneNumber: string): MockDisposition {
  switch (phoneNumber.slice(-1)) {
    case "2":
      return "voicemail";
    case "3":
      return "no_answer";
    case "4":
      return "error";
    default:
      return "completed";
  }
}

const TERMINAL_SUMMARIES: Record<MockDisposition, string> = {
  completed: "Objective completed. Every must-ask question was answered.",
  voicemail: "Reached voicemail and left a callback message.",
  no_answer: "No one answered after six rings.",
  error: "Carrier error - the call could not be completed.",
};

function buildTranscript(plan: CallPlan, disposition: MockDisposition): string | null {
  if (disposition === "no_answer" || disposition === "error") {
    return null;
  }
  if (disposition === "voicemail") {
    return [
      "[system] Voicemail greeting detected.",
      `[agent] Hi, this is ${plan.callerIdentity}'s AI assistant calling ${plan.businessName} regarding: ${plan.objective}.`,
      plan.callbackNumber
        ? `[agent] Please call us back at ${plan.callbackNumber}. Thank you.`
        : "[agent] We will try again later. Thank you.",
    ].join("\n");
  }
  const lines = [
    `[agent] Hi there - I'm ${plan.callerIdentity}'s AI assistant. I'm calling about: ${plan.objective}. Heads up, this call is recorded - got a quick minute?`,
    `[callee] Sure, this is ${plan.businessName}, how can I help?`,
  ];
  plan.mustAsk.forEach((question, index) => {
    lines.push(`[agent] ${question}`);
    lines.push(`[callee] ${CANNED_ANSWERS[index % CANNED_ANSWERS.length]}`);
  });
  lines.push("[agent] Great, that covers everything. Thanks for your time. Goodbye.");
  lines.push("[callee] You're welcome. Goodbye.");
  return lines.join("\n");
}

export class MockCallBackend implements CallBackend {
  readonly id = "mock" as const;
  readonly capabilities: CallBackendCapabilities = {
    supportsPause: false,
    supportsSupervision: false,
    supportsWarmTransfer: false,
    supportsDtmf: false,
  };

  private readonly calls = new Map<string, MockCallEntry>();

  async dispatchCall(plan: CallPlan): Promise<{ callId: string }> {
    if (!US_E164_REGEX.test(plan.phoneNumber)) {
      throw new Error(
        `Mock backend requires a US E.164 number (+1XXXXXXXXXX), got: ${plan.phoneNumber}`,
      );
    }
    const callId = `mock-${randomUUID()}`;
    this.calls.set(callId, { plan, polls: 0, cancelled: false });
    return { callId };
  }

  async getStatus(callId: string): Promise<CallStatus> {
    const entry = this.requireCall(callId);
    if (entry.cancelled) {
      return {
        callId,
        state: "cancelled",
        completed: true,
        disposition: "cancelled",
        summary: "Call was cancelled before completion.",
      };
    }
    entry.polls += 1;
    if (entry.polls < 2) {
      return {
        callId,
        state: "in_progress",
        completed: false,
        disposition: null,
        summary: null,
      };
    }
    const disposition = mockDispositionFor(entry.plan.phoneNumber);
    return {
      callId,
      state:
        disposition === "no_answer" || disposition === "error"
          ? "failed"
          : "completed",
      completed: true,
      disposition,
      summary: TERMINAL_SUMMARIES[disposition],
    };
  }

  async getArtifacts(callId: string): Promise<CallArtifacts> {
    const entry = this.requireCall(callId);
    const disposition = mockDispositionFor(entry.plan.phoneNumber);
    const succeeded = disposition === "completed" || disposition === "voicemail";
    const structuredOutcome: Record<string, unknown> = {
      disposition,
      summary: TERMINAL_SUMMARIES[disposition],
      mustAskAnswers:
        disposition === "completed"
          ? entry.plan.mustAsk.map((question, index) => ({
              question,
              answer: CANNED_ANSWERS[index % CANNED_ANSWERS.length],
            }))
          : [],
      costUsd: disposition === "completed" ? 0.42 : succeeded ? 0.18 : 0,
      durationSeconds: disposition === "completed" ? 184 : succeeded ? 42 : 0,
    };
    return {
      callId,
      recordingRef: succeeded ? MOCK_RECORDING_DATA_URI : null,
      transcript: buildTranscript(entry.plan, disposition),
      structuredOutcome,
    };
  }

  async cancelCall(callId: string): Promise<void> {
    const entry = this.requireCall(callId);
    entry.cancelled = true;
  }

  private requireCall(callId: string): MockCallEntry {
    const entry = this.calls.get(callId);
    if (!entry) {
      throw new Error(`Unknown mock call: ${callId}`);
    }
    return entry;
  }
}
