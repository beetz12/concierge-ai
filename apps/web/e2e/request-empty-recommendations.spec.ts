import { expect, test } from "@playwright/test";

const requestId = "00000000-0000-0000-0000-000000000099";

const seededRequest = {
  id: requestId,
  type: "RESEARCH_AND_BOOK",
  title: "No provider case",
  description: "Need a landscaper in Greenville, SC",
  location: "Greenville, SC",
  criteria: "Need a landscaper in Greenville, SC",
  status: "ANALYZING",
  createdAt: "2026-03-08T10:00:00.000Z",
  providersFound: [],
  interactions: [],
  userPhone: "+18645550199",
  preferredContact: "text",
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript((request) => {
    window.localStorage.setItem("concierge_requests", JSON.stringify([request]));
  }, seededRequest);
});

test("renders empty recommendation state when no providers qualify", async ({ page }) => {
  await page.goto(`/request/${requestId}`);

  await expect(
    page.getByRole("heading", { name: "No provider case" }),
  ).toBeVisible();
  await expect(page.getByText("Generating recommendations with AI...")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "No Qualified Providers Found" }),
  ).toBeVisible();
  await expect(
    page.getByText("none of the providers met your requirements", { exact: false }),
  ).toBeVisible();
});
