import type { VoiceSession } from "./types.js";

export interface ParsedProviderSignal {
  availability?: string;
  estimatedRate?: string;
  wrongNumber: boolean;
  clarificationNeeded: boolean;
  schedulingIntent: boolean;
  escalationNeeded: boolean;
}

const AVAILABILITY_PATTERNS = [
  /(tomorrow(?:\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm))?)/i,
  /((?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm))?)/i,
  /(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i,
];

const RATE_PATTERNS = [
  /(\$\d+(?:\.\d{2})?(?:\s*\/\s*(?:hour|hr))?)/i,
  /(\d+(?:\.\d{2})?\s*dollars?\s*(?:an?\s*)?(?:hour|hr))/i,
];

export const parseProviderSignals = (text: string): ParsedProviderSignal => {
  const normalized = text.trim();
  const lower = normalized.toLowerCase();

  const availability =
    AVAILABILITY_PATTERNS.map((pattern) => normalized.match(pattern)?.[1]).find(Boolean) ||
    undefined;
  const estimatedRate =
    RATE_PATTERNS.map((pattern) => normalized.match(pattern)?.[1]).find(Boolean) ||
    undefined;

  return {
    availability,
    estimatedRate,
    wrongNumber: /wrong number|you have the wrong (?:number|person)|stop calling/i.test(lower),
    clarificationNeeded:
      normalized.length === 0 ||
      /not sure|can you repeat|what was that|i didn't catch that/i.test(lower),
    schedulingIntent: /book|schedule|lock it in|set it up/i.test(lower),
    escalationNeeded: /lawsuit|credit card|payment up front|do not call again|speak to a manager/i.test(
      lower,
    ),
  };
};

export const buildPromptMutation = (session: VoiceSession): string => {
  if (session.metadata.availability && session.metadata.estimatedRate) {
    return "Provider qualified. Confirm next step or hand off for booking.";
  }

  if (session.metadata.availability) {
    return "Availability captured. Ask for rate and booking readiness.";
  }

  return "Collect earliest availability first, then gather estimated rate.";
};

export const shouldEndForWrongNumber = (signal: ParsedProviderSignal): boolean => {
  return signal.wrongNumber;
};

export const shouldEscalateToSupervisor = (
  signal: ParsedProviderSignal,
): boolean => {
  return signal.escalationNeeded;
};

export const shouldHandoffToBooking = (
  session: VoiceSession,
  signal: ParsedProviderSignal,
): boolean => {
  return Boolean(
    (signal.schedulingIntent || session.metadata.readyToBook === "true") &&
      session.metadata.availability &&
      session.metadata.estimatedRate,
  );
};
