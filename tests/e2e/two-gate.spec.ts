import { expect, test } from "@playwright/test";
import { generatePlan, runPreflightAllow } from "./helpers";

test("@dispatch dispatch stays blocked until the compliance preflight allows", async ({
  page,
}) => {
  await page.goto("/dispatch");

  await generatePlan(page, {
    clientName: "Jordan Lee",
    contactName: "Uptown Plumbing",
    phone: "+18645550120",
    task: "Find out if they service tankless water heaters and what the visit fee is",
  });

  // Gate 2 is disabled before any preflight has run.
  const approve = page.getByTestId("approve-dispatch");
  await expect(approve).toBeVisible();
  await expect(approve).toBeDisabled();

  // After the policy engine allows, the gate opens.
  await runPreflightAllow(page);
  await expect(approve).toBeEnabled();
});
