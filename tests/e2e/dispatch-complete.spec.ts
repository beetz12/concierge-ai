import { expect, test } from "@playwright/test";
import {
  approveAndOpenLiveView,
  generatePlan,
  runPreflightAllow,
} from "./helpers";

test("@dispatch approve dispatches through the mock backend and renders artifacts", async ({
  page,
}) => {
  await page.goto("/dispatch");

  await generatePlan(page, {
    clientName: "Jordan Lee",
    contactName: "Acme Appliances",
    // Last digit 1 -> the mock backend completes the call.
    phone: "+18645550131",
    task: "Request a refund for the broken dryer delivered on June 20",
  });
  await runPreflightAllow(page);
  await approveAndOpenLiveView(page);

  // Live status polls to the terminal state.
  await expect(page.getByTestId("call-terminal-state")).toContainText(
    "Completed",
    { timeout: 20_000 },
  );

  // Artifacts: recording player, transcript, structured outcome,
  // cost and duration.
  const audio = page.getByTestId("artifact-audio");
  await expect(audio).toBeVisible();
  expect(await audio.getAttribute("src")).toMatch(/^data:audio\/wav;base64,/);

  await expect(page.getByTestId("artifact-transcript")).toContainText(
    "AI assistant",
  );
  await expect(page.getByTestId("artifact-disposition")).toHaveText(
    "completed",
  );
  await expect(page.getByTestId("artifact-cost")).toHaveText("$0.42");
  await expect(page.getByTestId("artifact-duration")).toHaveText("3m 4s");
  expect(await page.getByTestId("outcome-answer").count()).toBeGreaterThan(0);
});
