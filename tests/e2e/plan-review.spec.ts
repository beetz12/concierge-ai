import { expect, test } from "@playwright/test";
import { generatePlan } from "./helpers";

test("@dispatch plan review renders the verbatim disclosure and ungranted pre-auth checkboxes", async ({
  page,
}) => {
  await page.goto("/dispatch");

  await generatePlan(page, {
    clientName: "Jordan Lee",
    contactName: "Acme Appliances",
    phone: "+18645550110",
    task: "Request a refund for the broken dryer delivered on June 20",
  });

  // Verbatim AI-disclosure opener from the plan generator.
  const disclosure = page.getByTestId("disclosure-line");
  await expect(disclosure).toBeVisible();
  await expect(disclosure).toContainText("AI assistant");
  await expect(disclosure).toContainText("recorded");

  // Refund tasks route to the disputes playbook: both pre-authorizations
  // render as checkboxes and every one starts OFF.
  const cancelBox = page.getByTestId("preauth-cancel_if_needed");
  const chargebackBox = page.getByTestId("preauth-chargeback_or_regulator");
  await expect(cancelBox).toBeVisible();
  await expect(chargebackBox).toBeVisible();
  await expect(cancelBox).not.toBeChecked();
  await expect(chargebackBox).not.toBeChecked();

  // Must-ask list, shareable context, voicemail policy, and target line.
  expect(await page.getByTestId("must-ask-item").count()).toBeGreaterThan(0);
  await expect(page.getByTestId("dispatch-context")).toBeVisible();
  await expect(page.getByTestId("voicemail-policy")).toBeVisible();
  await expect(page.getByTestId("dispatch-target")).toContainText(
    "+18645550110",
  );
});
