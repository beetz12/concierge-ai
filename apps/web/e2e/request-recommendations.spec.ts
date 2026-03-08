import { expect, test } from "@playwright/test";

const requestId = "00000000-0000-0000-0000-000000000001";

const seededRequest = {
  id: requestId,
  type: "RESEARCH_AND_BOOK",
  title: "Landscaper shortlist",
  description: "Need a landscaper in Greenville, SC",
  location: "Greenville, SC",
  clientAddress: "42 Grand Ave, Greenville, SC 29607",
  criteria: "Need a landscaper in Greenville, SC",
  status: "ANALYZING",
  createdAt: "2026-03-08T10:00:00.000Z",
  providersFound: [
    {
      id: "provider-1",
      name: "Greenville Outdoor Living",
      phone: "+18647877800",
      rating: 4.9,
      address: "42 Grand Ave, Greenville, SC 29607",
      reviewCount: 38,
    },
    {
      id: "provider-2",
      name: "Retain Roots",
      phone: "+18643719677",
      rating: 4.8,
      address: "15 Main St, Greenville, SC 29601",
      reviewCount: 16,
    },
    {
      id: "provider-3",
      name: "Neighborhood Favorite Landscaping",
      phone: "+18645551234",
      rating: 5,
      address: "89 Oak Dr, Greenville, SC 29605",
      reviewCount: 2,
    },
  ],
  interactions: [],
  userPhone: "+18645550199",
  preferredContact: "text",
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/bookings/schedule-async", async (route) => {
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          bookingInitiated: true,
          bookingStatus: "initiated",
          method: "demo",
        },
      }),
    });
  });

  await page.addInitScript((request) => {
    window.localStorage.setItem("concierge_requests", JSON.stringify([request]));
  }, seededRequest);
});

test("renders rich recommendation evidence and allows booking initiation", async ({
  page,
}) => {
  await page.goto(`/request/${requestId}`);

  await expect(
    page.getByRole("heading", { name: "Landscaper shortlist" }),
  ).toBeVisible();
  await expect(page.getByText("Generating recommendations with AI...")).toBeVisible();
  await expect(page.getByText("AI Recommendation Summary")).toBeVisible();

  await expect(
    page.getByText("Concierge Recommended", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("TOP PICK")).toBeVisible();
  await expect(page.getByText("Trade fit: medium")).toHaveCount(3);
  await expect(page.getByText("Identity: medium")).toHaveCount(3);
  await expect(page.getByText("Sources: google")).toHaveCount(3);
  await expect(page.getByText("Strengths")).toHaveCount(3);
  await expect(page.getByText("Thinner review evidence")).toBeVisible();

  await page.getByRole("button", { name: "Select This Provider" }).first().click();

  await expect(
    page.getByRole("heading", { name: "Confirm Booking" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Greenville Outdoor Living" }).nth(1),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm & Book" }).click();

  await expect(page.getByText("Booking call started!")).toBeVisible();
});
