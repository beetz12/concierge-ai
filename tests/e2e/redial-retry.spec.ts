import { expect, test } from "@playwright/test";
import { API_URL } from "./helpers";

test("@dispatch retry respects the redial guard and offers the SMS channel switch", async ({
  page,
  request,
}) => {
  // Dispatch the first (approved) call straight through the API.
  // Last digit 3 -> the mock backend reports no_answer, so the live view
  // offers the retry affordance.
  const response = await request.post(`${API_URL}/api/v1/dispatch`, {
    data: {
      contactName: "Redial Test Co",
      phoneNumber: "+18645550153",
      objective: "Confirm the delivery window for order 4417",
      context: "",
      mustAsk: ["What is the delivery window?"],
      clientName: "Jordan Lee",
      voicemailPolicy: "hang_up",
      taskType: "make_inquiry",
      userApproved: true,
      grantedPreAuthorizations: [],
    },
  });
  expect(response.ok()).toBeTruthy();
  const { callId } = (await response.json()) as { callId: string };

  await page.goto(`/dispatch/${callId}`);
  await expect(page.getByTestId("call-terminal-state")).toContainText(
    "No answer",
    { timeout: 20_000 },
  );

  // Retrying the same number inside 24h trips the redial guard...
  await page.getByTestId("retry-call").click();
  await expect(page.getByTestId("redial-blocked-notice")).toBeVisible();

  // ...and the UX offers the SMS channel switch instead.
  await page.getByTestId("switch-to-sms").click();
  await expect(page.getByTestId("sms-sent")).toBeVisible();
  await expect(page.getByTestId("sms-sent")).toContainText("mock-sms-");
});
