/**
 * Per-state policy rules — a typed transcription of
 * docs/compliance/policy-matrix.md (one row per US state + DC, 51 rows).
 *
 * Columns carried here are the ones the engine evaluates at dial time:
 * recording-consent mode, state-mandated AI disclosure, the WA ADAD flat
 * ban, and quiet-hour deltas from the federal 8:00 a.m.–9:00 p.m. window.
 * Narrative context and citations live in the matrix; when this table and
 * the matrix disagree, the matrix wins — fix the transcription.
 */
import type { QuietHoursWindow, RecordingConsentMode, StateCode } from "./types.js";

export interface StateRule {
  code: StateCode;
  name: string;
  recordingConsent: RecordingConsentMode;
  /**
   * Allowed calling window in callee-local minutes. Only FL deviates from
   * the federal window (8a–8p, Fla. Stat. 501.059(8)(b)).
   */
  quietHours: QuietHoursWindow;
  /**
   * RCW 80.36.400: flat prohibition on AI/recorded-voice commercial
   * solicitation calls regardless of consent (WA only; R-8).
   */
  adadSolicitationBan: boolean;
  /**
   * State independently MANDATES AI/bot disclosure (CA AB 2905, UT SB 149,
   * CO SB 24-205). The product discloses AI on every call regardless (R-12);
   * this flags where non-disclosure is independently unlawful.
   */
  aiDisclosureMandated: boolean;
}

/** Federal calling window: 8:00 a.m.–9:00 p.m. callee-local (47 CFR 64.1200(c)(1)). */
export const FEDERAL_QUIET_HOURS: QuietHoursWindow = {
  startMinute: 8 * 60,
  endMinute: 21 * 60,
};

/** Florida delta: 8:00 a.m.–8:00 p.m. (Fla. Stat. 501.059(8)(b)). */
export const FLORIDA_QUIET_HOURS: QuietHoursWindow = {
  startMinute: 8 * 60,
  endMinute: 20 * 60,
};

const rule = (
  code: StateCode,
  name: string,
  recordingConsent: RecordingConsentMode,
  overrides: Partial<Omit<StateRule, "code" | "name" | "recordingConsent">> = {},
): StateRule => ({
  code,
  name,
  recordingConsent,
  quietHours: FEDERAL_QUIET_HOURS,
  adadSolicitationBan: false,
  aiDisclosureMandated: false,
  ...overrides,
});

export const STATE_RULES: Record<StateCode, StateRule> = {
  AL: rule("AL", "Alabama", "one_party"),
  AK: rule("AK", "Alaska", "one_party"),
  AZ: rule("AZ", "Arizona", "one_party"),
  AR: rule("AR", "Arkansas", "one_party"),
  CA: rule("CA", "California", "all_party", { aiDisclosureMandated: true }),
  CO: rule("CO", "Colorado", "one_party", { aiDisclosureMandated: true }),
  CT: rule("CT", "Connecticut", "all_party_disputed"),
  DE: rule("DE", "Delaware", "all_party_disputed"),
  DC: rule("DC", "District of Columbia", "one_party"),
  FL: rule("FL", "Florida", "all_party", { quietHours: FLORIDA_QUIET_HOURS }),
  GA: rule("GA", "Georgia", "one_party"),
  HI: rule("HI", "Hawaii", "one_party"),
  ID: rule("ID", "Idaho", "one_party"),
  IL: rule("IL", "Illinois", "all_party"),
  IN: rule("IN", "Indiana", "one_party"),
  IA: rule("IA", "Iowa", "one_party"),
  KS: rule("KS", "Kansas", "one_party"),
  KY: rule("KY", "Kentucky", "one_party"),
  LA: rule("LA", "Louisiana", "one_party"),
  ME: rule("ME", "Maine", "one_party"),
  MD: rule("MD", "Maryland", "all_party"),
  MA: rule("MA", "Massachusetts", "all_party"),
  MI: rule("MI", "Michigan", "all_party_disputed"),
  MN: rule("MN", "Minnesota", "one_party"),
  MS: rule("MS", "Mississippi", "one_party"),
  MO: rule("MO", "Missouri", "one_party"),
  MT: rule("MT", "Montana", "all_party"),
  NE: rule("NE", "Nebraska", "one_party"),
  NV: rule("NV", "Nevada", "all_party_disputed"),
  NH: rule("NH", "New Hampshire", "all_party"),
  NJ: rule("NJ", "New Jersey", "one_party"),
  NM: rule("NM", "New Mexico", "one_party"),
  NY: rule("NY", "New York", "one_party"),
  NC: rule("NC", "North Carolina", "one_party"),
  ND: rule("ND", "North Dakota", "one_party"),
  OH: rule("OH", "Ohio", "one_party"),
  OK: rule("OK", "Oklahoma", "one_party"),
  // One-party for TELEPHONE under ORS 165.540(1)(a); all-party applies only
  // to in-person recording (matrix: not all-party for phone).
  OR: rule("OR", "Oregon", "one_party"),
  PA: rule("PA", "Pennsylvania", "all_party"),
  RI: rule("RI", "Rhode Island", "one_party"),
  SC: rule("SC", "South Carolina", "one_party"),
  SD: rule("SD", "South Dakota", "one_party"),
  TN: rule("TN", "Tennessee", "one_party"),
  TX: rule("TX", "Texas", "one_party"),
  UT: rule("UT", "Utah", "one_party", { aiDisclosureMandated: true }),
  VT: rule("VT", "Vermont", "one_party"),
  VA: rule("VA", "Virginia", "one_party"),
  WA: rule("WA", "Washington", "all_party", { adadSolicitationBan: true }),
  WV: rule("WV", "West Virginia", "one_party"),
  WI: rule("WI", "Wisconsin", "one_party"),
  WY: rule("WY", "Wyoming", "one_party"),
};

/** Firm + disputed all-party set; the engine treats both as all-party (R-6). */
export function requiresAllPartyRecording(mode: RecordingConsentMode): boolean {
  return mode === "all_party" || mode === "all_party_disputed";
}
