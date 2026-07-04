import { expect, test } from "@playwright/test";
import {
  approveAndOpenLiveView,
  createCase,
  generatePlan,
  runPreflightAllow,
} from "./helpers";

test("@dispatch case-linked dispatch auto-attaches and shows on the case timeline", async ({
  page,
  request,
}) => {
  const kase = await createCase(request, {
    title: `Dryer refund dispute ${Date.now()}`,
    counterpartyName: "Acme Appliances",
    // Last digit 1 -> completed call.
    counterpartyPhone: "+18645550141",
  });

  await page.goto(`/dispatch?caseId=${kase.id}`);

  // Case linkage banner + counterparty prefill from the case record.
  await expect(page.getByTestId("dispatch-case-link")).toBeVisible();
  await expect(page.getByTestId("dispatch-contact-name")).toHaveValue(
    "Acme Appliances",
  );
  await expect(page.getByTestId("dispatch-phone")).toHaveValue("+18645550141");

  await generatePlan(page, {
    clientName: "Jordan Lee",
    task: "Follow up on the promised refund for the broken dryer",
  });
  await runPreflightAllow(page);
  await approveAndOpenLiveView(page);

  await expect(page.getByTestId("call-terminal-state")).toContainText(
    "Completed",
    { timeout: 20_000 },
  );

  // Auto-attached: the artifacts card links straight to the case.
  const caseLink = page.getByTestId("attached-case-link");
  await expect(caseLink).toBeVisible();
  await caseLink.click();
  await page.waitForURL(new RegExp(`/cases/${kase.id}`));

  // The case timeline shows the call event with a link back to the call.
  await expect(page.getByText("Outbound call to Acme Appliances")).toBeVisible();
  const backLink = page.getByTestId("timeline-call-link").first();
  await expect(backLink).toBeVisible();
  expect(await backLink.getAttribute("href")).toMatch(/\/dispatch\/mock-/);
});
