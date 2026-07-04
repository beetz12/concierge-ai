import { expect, test } from "@playwright/test";
import { generatePlan } from "./helpers";

test("@dispatch policy deny renders human-readable reasons and keeps Gate 2 shut", async ({
  page,
}) => {
  await page.goto("/dispatch");

  await generatePlan(page, {
    clientName: "Jordan Lee",
    contactName: "Acme Appliances",
    // Seven digits: cannot normalize to +1XXXXXXXXXX, so the policy engine
    // denies with invalid_target_number.
    phone: "555-0123",
    task: "Ask whether they repair front-load dryers",
  });

  await page.getByTestId("run-preflight").click();
  await expect(page.getByTestId("preflight-deny")).toBeVisible();
  await expect(page.getByTestId("deny-reason")).toContainText(
    "not a valid US number",
  );

  // The deny keeps the approve gate shut.
  await expect(page.getByTestId("approve-dispatch")).toBeDisabled();
});
