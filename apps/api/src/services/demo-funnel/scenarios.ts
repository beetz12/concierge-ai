/**
 * Curated scenario catalog for the landing-page demo funnel.
 *
 * A visitor picks one of these scenarios and (after SMS OTP verification)
 * receives a single AI demo call to their own number. The AI treats the
 * VISITOR as the business being called and role-plays the scenario, so the
 * visitor experiences what it is like to be on the receiving end of the
 * Concierge assistant.
 *
 * Every callScript:
 *   1. OPENS with the mandatory recorded-line disclosure (see
 *      {@link buildDisclosure} / {@link DISCLOSURE_VERSION}).
 *   2. Role-plays the scenario for roughly 90 seconds.
 *   3. CLOSES by inviting the visitor to create their own AI concierge.
 *
 * The scripts are server-side prompt content: routes must expose only the
 * public fields (id, label, description, enabled, requiresMembership).
 */

/**
 * Version tag stored on every demo_calls row so we can prove exactly which
 * disclosure wording a given call opened with.
 */
export const DISCLOSURE_VERSION = "demo-disclosure-v1";

/** Assistant name used in the mandatory opening disclosure. */
const ASSISTANT_NAME = "Casey";

/**
 * Legal entity named in the disclosure. Overridable per deployment via
 * LEGAL_ENTITY_NAME; the fallback matches the marketing site.
 */
const legalEntityName = (): string =>
  process.env.LEGAL_ENTITY_NAME?.trim() || "Concierge AI";

/** The mandatory disclosure every demo call must open with, verbatim. */
export const buildDisclosure = (): string =>
  `I'm ${ASSISTANT_NAME}, an AI assistant calling from ${legalEntityName()} — ` +
  "this is the demo call you just requested, and calls may be recorded";

export interface DemoFunnelScenario {
  /** Stable identifier used by the API (e.g. "refund-request"). */
  id: string;
  /** Short UI label. */
  label: string;
  /** One-line description for the scenario picker. */
  description: string;
  /** Server-side objective/context for the CallPlan. Never sent to clients. */
  callScript: string;
  /** Who the agent presents itself as on the call. */
  callerIdentity: string;
  /** True when the scenario needs a paid membership (not callable via demo). */
  requiresMembership: boolean;
  /** False disables dispatch for this scenario (still listed for the UI). */
  enabled: boolean;
}

/** Shared structural instructions appended to every scenario script. */
const buildScript = (rolePlay: string): string =>
  `MANDATORY OPENING — say this first, before anything else: "${buildDisclosure()}." ` +
  `Then role-play this scenario, treating the person who answers as the business being called: ${rolePlay} ` +
  "Keep the whole call to roughly 90 seconds: stay friendly, natural, and brisk. " +
  "Close by thanking them and inviting them to create their own AI concierge at " +
  `${legalEntityName()} so it can make calls like this one on their behalf, then say goodbye and end the call.`;

export const DEMO_FUNNEL_SCENARIOS: DemoFunnelScenario[] = [
  {
    id: "refund-request",
    label: "Ask for a refund",
    description:
      "Hear the AI politely but firmly request a refund for a purchase.",
    callScript: buildScript(
      "you are calling a retail store on behalf of a customer whose blender arrived " +
        "broken last week. Ask for a full refund to the original payment method, " +
        "mention the order was placed nine days ago and is within the return window, " +
        "and ask what the store needs to process it.",
    ),
    callerIdentity: "an AI concierge calling on behalf of a customer",
    requiresMembership: false,
    enabled: true,
  },
  {
    id: "appointment-check",
    label: "Check on an appointment",
    description: "The AI confirms the time and details of an upcoming appointment.",
    callScript: buildScript(
      "you are calling a dental office to confirm a client's cleaning appointment " +
        "this Thursday. Verify the time, ask whether any paperwork or insurance " +
        "card is needed on arrival, and ask about parking.",
    ),
    callerIdentity: "an AI concierge calling on behalf of a client",
    requiresMembership: false,
    enabled: true,
  },
  {
    id: "reservation-booking",
    label: "Book a dinner reservation",
    description: "The AI books a table for two at a restaurant.",
    callScript: buildScript(
      "you are calling a restaurant to book a dinner reservation for two this " +
        "Saturday around 7 PM. Ask about availability, request a quieter table if " +
        "possible, and confirm the cancellation policy.",
    ),
    callerIdentity: "an AI concierge booking on behalf of a diner",
    requiresMembership: false,
    enabled: true,
  },
  {
    id: "quote-request",
    label: "Get a quote for a home service",
    description: "The AI gathers pricing and availability for a home repair job.",
    callScript: buildScript(
      "you are calling a plumbing company for a quote to replace a leaking kitchen " +
        "faucet. Ask for a rough price range, whether they charge a service-visit " +
        "fee, and their earliest availability this week.",
    ),
    callerIdentity: "an AI concierge calling on behalf of a homeowner",
    requiresMembership: false,
    enabled: true,
  },
  {
    id: "order-status",
    label: "Chase up an order",
    description: "The AI follows up on a delayed order and gets a delivery date.",
    callScript: buildScript(
      "you are calling a furniture store about a couch ordered five weeks ago that " +
        "was promised in three. Ask for the current status, a firm delivery date, " +
        "and what compensation is available if it slips again.",
    ),
    callerIdentity: "an AI concierge following up for a customer",
    requiresMembership: false,
    enabled: true,
  },
  {
    id: "hours-availability",
    label: "Ask about hours and availability",
    description: "The AI checks opening hours and walk-in availability.",
    callScript: buildScript(
      "you are calling a barbershop to ask about weekend opening hours, whether " +
        "walk-ins are accepted on Saturday mornings, and how long the typical wait is.",
    ),
    callerIdentity: "an AI concierge checking availability for a client",
    requiresMembership: false,
    enabled: true,
  },
  {
    // Listed so the UI can render an upsell tile; NEVER dispatchable from the
    // public demo funnel (enabled: false + requiresMembership: true).
    id: "custom",
    label: "Your own scenario",
    description:
      "Members can script any call they like — negotiations, complaints, research.",
    callScript: "",
    callerIdentity: "an AI concierge",
    requiresMembership: true,
    enabled: false,
  },
];

/** Look up a scenario by id, or undefined when unknown. */
export const getScenario = (id: string): DemoFunnelScenario | undefined =>
  DEMO_FUNNEL_SCENARIOS.find((scenario) => scenario.id === id);

/**
 * Public projection of the catalog for GET /scenarios: everything EXCEPT the
 * server-side callScript/callerIdentity prompt content.
 */
export const listPublicScenarios = (): Array<{
  id: string;
  label: string;
  description: string;
  requiresMembership: boolean;
  enabled: boolean;
}> =>
  DEMO_FUNNEL_SCENARIOS.map(
    ({ id, label, description, requiresMembership, enabled }) => ({
      id,
      label,
      description,
      requiresMembership,
      enabled,
    }),
  );
