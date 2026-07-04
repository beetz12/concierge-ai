import { expect, type APIRequestContext, type Page } from "@playwright/test";

/** Test API server (DEMO_MODE=true, CALL_BACKEND=mock; see playwright.config.ts). */
export const API_URL = "http://127.0.0.1:8180";

export interface CreatedCase {
  id: string;
  title: string;
}

/** Create a case straight through the API (demo auth is automatic). */
export async function createCase(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {},
): Promise<CreatedCase> {
  const response = await request.post(`${API_URL}/api/v1/cases`, {
    data: {
      title: `Dispatch e2e case ${Date.now()}`,
      disputeType: "delivery",
      counterpartyName: "Acme Appliances",
      counterpartyPhone: "+18645550201",
      ...overrides,
    },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as CreatedCase;
}

export interface DispatchFormInput {
  clientName?: string;
  contactName?: string;
  phone?: string;
  task: string;
}

/** Fill the dispatch form and generate the Gate-1 plan. */
export async function generatePlan(
  page: Page,
  input: DispatchFormInput,
): Promise<void> {
  if (input.clientName !== undefined) {
    await page.getByTestId("dispatch-client-name").fill(input.clientName);
  }
  if (input.contactName !== undefined) {
    await page.getByTestId("dispatch-contact-name").fill(input.contactName);
  }
  if (input.phone !== undefined) {
    await page.getByTestId("dispatch-phone").fill(input.phone);
  }
  await page.getByTestId("dispatch-task").fill(input.task);
  await page.getByTestId("dispatch-generate-plan").click();
  await expect(page.getByTestId("dispatch-plan")).toBeVisible();
}

/** Run the compliance preflight and wait for an allow. */
export async function runPreflightAllow(page: Page): Promise<void> {
  await page.getByTestId("run-preflight").click();
  await expect(page.getByTestId("preflight-allow")).toBeVisible();
}

/** Gate 2: approve, then land on the live status view. */
export async function approveAndOpenLiveView(page: Page): Promise<void> {
  await page.getByTestId("approve-dispatch").click();
  await page.waitForURL(/\/dispatch\/mock-/);
}
