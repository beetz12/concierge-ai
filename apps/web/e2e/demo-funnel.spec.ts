import { expect, test } from "@playwright/test";

/**
 * Happy-path spec for the landing-page demo funnel UI.
 *
 * Like the other web-demo specs, every /api/v1/demo-funnel/* call is mocked
 * with page.route so the spec only needs the web server: it verifies the UI
 * wiring (scenario -> phone -> OTP -> calling -> done) and the request bodies
 * the funnel sends, not the API implementation (covered by the API's own
 * node:test suite in apps/api/src/routes/demo-funnel.test.ts).
 */

const scenarios = [
  {
    id: "refund-request",
    label: "Ask for a refund",
    description: "Hear the AI politely but firmly request a refund for a purchase.",
    requiresMembership: false,
    enabled: true,
  },
  {
    id: "reservation-booking",
    label: "Book a dinner reservation",
    description: "The AI books a table for two at a restaurant.",
    requiresMembership: false,
    enabled: true,
  },
  {
    id: "custom",
    label: "Your own scenario",
    description:
      "Members can script any call they like — negotiations, complaints, research.",
    requiresMembership: true,
    enabled: false,
  },
];

const VERIFICATION_TOKEN = "e2e-verification-token";
const CALL_ID = "mock-e2e-call-0001";

test("walks the demo funnel from scenario pick to completed call", async ({
  page,
}) => {
  let callBody: Record<string, unknown> | null = null;
  let statusPolls = 0;

  await page.route("**/api/v1/demo-funnel/scenarios", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ scenarios }),
    });
  });

  await page.route("**/api/v1/demo-funnel/otp/send", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "sent", simulated: true }),
    });
  });

  await page.route("**/api/v1/demo-funnel/otp/verify", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "verified",
        verificationToken: VERIFICATION_TOKEN,
      }),
    });
  });

  await page.route("**/api/v1/demo-funnel/call", async (route) => {
    callBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ status: "dispatched", callId: CALL_ID }),
    });
  });

  await page.route(
    `**/api/v1/demo-funnel/call/${CALL_ID}/status**`,
    async (route) => {
      statusPolls += 1;
      const terminal = statusPolls >= 2;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          terminal
            ? {
                state: "completed",
                completed: true,
                disposition: "completed",
                summary: "Objective completed.",
              }
            : {
                state: "in_progress",
                completed: false,
                disposition: null,
                summary: null,
              },
        ),
      });
    },
  );

  await page.goto("/");

  // Step 1: scenario picker with the locked membership upsell tile.
  await expect(
    page.getByRole("heading", { name: "What should the AI call you about?" }),
  ).toBeVisible();
  const lockedTile = page.getByRole("button", { name: /Your own scenario/ });
  await expect(lockedTile).toHaveAttribute("aria-disabled", "true");
  await expect(lockedTile.getByText("Members", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Ask for a refund/ }).click();
  await page.getByRole("button", { name: "Continue →" }).click();

  // Step 2: phone number + SMS consent copy.
  await expect(
    page.getByRole("heading", { name: "Where should the AI call you?" }),
  ).toBeVisible();
  await expect(page.getByText("Scenario:")).toBeVisible();
  await page.getByLabel("Your US phone number").fill("(864) 555-0199");
  await page.getByRole("button", { name: "Text me a code" }).click();

  // Step 3: OTP entry; demo environments surface the simulated-SMS notice.
  await expect(
    page.getByRole("heading", { name: "Enter your code" }),
  ).toBeVisible();
  await expect(page.getByText("(864) 555-0199")).toBeVisible();
  await expect(
    page.getByText("Demo environment: the SMS was simulated, not actually sent."),
  ).toBeVisible();
  await page.getByLabel("6-digit verification code").fill("123456");
  await page.getByRole("button", { name: "Verify & call me" }).click();

  // Step 4: dispatched — the calling pane polls status until terminal.
  await expect(
    page.getByRole("heading", { name: /Answer your phone/ }),
  ).toBeVisible();

  // Step 5: terminal status flips to the completed done pane with the CTA.
  await expect(
    page.getByRole("heading", { name: "That was your AI concierge." }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByRole("link", { name: "Get your own AI concierge →" }),
  ).toBeVisible();

  // The dispatch used the verified token and the picked scenario — nothing else.
  expect(callBody).toEqual({
    verificationToken: VERIFICATION_TOKEN,
    scenarioId: "refund-request",
  });
  expect(statusPolls).toBeGreaterThanOrEqual(2);
});
