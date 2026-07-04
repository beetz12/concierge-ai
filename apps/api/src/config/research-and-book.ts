/**
 * Research-and-Book feature flag.
 *
 * The legacy Research-and-Book calling flow (POST /providers/call,
 * /providers/batch-call, /providers/batch-call-async, /providers/book, and the
 * Twilio auto-book trigger) places REAL outbound calls with the compliance gate
 * and org context bypassed. It is DISABLED by default for v1 and only enabled
 * when `ENABLE_RESEARCH_AND_BOOK` is set to the exact string "true".
 */
export const isResearchAndBookEnabled = (): boolean => {
  return process.env.ENABLE_RESEARCH_AND_BOOK === "true";
};

/** JSON error body returned when a Research-and-Book route is called while disabled. */
export const RESEARCH_AND_BOOK_DISABLED_ERROR = {
  error: "ResearchAndBookDisabled",
  message:
    "The Research-and-Book calling flow is not enabled in this deployment.",
} as const;
