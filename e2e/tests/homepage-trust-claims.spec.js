import { test, expect } from "@playwright/test";

// Homepage trust claims (audit 2026-11-24, WC-01/02/04): no "real photos of
// every product / no stock images" card, returns qualified as "on eligible
// products" with a Returns Policy link, no "100%" claims, meta description
// without "easy 7-day returns". API fully mocked: no request reaches a real
// server, and every non-GET is aborted.

async function mockApi(page) {
  await page.route("**/*", async (route) => {
    const req = route.request();
    if (req.method() !== "GET") return route.abort();
    const url = new URL(req.url());
    if (!url.pathname.startsWith("/api/") || url.port === "5173") return route.continue();
    if (url.pathname === "/api/settings") {
      return route.fulfill({ json: { success: true, settings: { phone: "+91-9999999999" } } });
    }
    // Everything else behaves like an unreachable backend: the homepage's
    // data sections handle a failed fetch, while a fake empty
    // {success: true} body would crash some of them.
    return route.abort();
  });
}

// WhyChooseUs sits inside LazyMount: keep sweeping the page (down, then
// from the top again -- the page grows while sections load) until it
// renders, then bring it into view.
async function scrollToWhyChooseUs(page) {
  const section = page.locator(".why-choose-us");
  const deadline = Date.now() + 20000;
  let y = 0;
  while (!(await section.count()) && Date.now() < deadline) {
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    y = y + 400 > height ? 0 : y + 400;
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await page.waitForTimeout(100);
  }
  await expect(section, "WhyChooseUs rendered after scrolling").toHaveCount(1);
  await section.scrollIntoViewIfNeeded();
  return section;
}

test.describe("Homepage trust claims", () => {
  test("TC-E1 English: TrustBar, WhyChooseUs, meta", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    const trust = page.locator(".trust-bar-card");
    await expect(trust).toContainText("On eligible products");
    await expect(trust).toContainText("Secure checkout");
    await expect(trust).not.toContainText(/Hassle-free|Easy Returns|100%/);

    const why = await scrollToWhyChooseUs(page);
    await expect(why.locator(".why-card")).toHaveCount(5);
    await expect(why).not.toContainText(/Real photos|no stock images|Genuine Product Images|Easy return|100%/i);
    await expect(why).toContainText("Returns are available on eligible products.");
    await expect(why.getByRole("link", { name: "Returns Policy" })).toHaveAttribute("href", "/policies/returns");
    await expect(why).toContainText("Secure checkout.");

    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      /7-day returns on eligible products\.$/,
    );
  });

  test("TC-E2 Hindi (/hi): TrustBar, WhyChooseUs, meta", async ({ page }) => {
    await mockApi(page);
    await page.goto("/hi");
    const trust = page.locator(".trust-bar-card");
    await expect(trust).toContainText("योग्य प्रोडक्ट्स पर");
    await expect(trust).toContainText("सुरक्षित चेकआउट");
    await expect(trust).not.toContainText(/झंझट|आसान रिटर्न|100%/);

    const why = await scrollToWhyChooseUs(page);
    await expect(why.locator(".why-card")).toHaveCount(5);
    await expect(why).not.toContainText(/असली प्रोडक्ट फोटो|स्टॉक इमेज|आसान रिटर्न|100%/);
    await expect(why.getByRole("link", { name: "रिटर्न पॉलिसी" })).toHaveAttribute("href", "/policies/returns");

    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      /योग्य प्रोडक्ट्स के लिए 7 दिनों के भीतर रिटर्न।$/,
    );
  });

  test("TC-E4 grid: tablet centres the lone last card at normal width; desktop and mobile unchanged", async ({ page }) => {
    await mockApi(page);
    const layout = async (width) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const why = await scrollToWhyChooseUs(page);
      return why.locator(".why-card").evaluateAll((cards) => {
        const grid = cards[0].parentElement.getBoundingClientRect();
        return cards.map((c) => {
          const r = c.getBoundingClientRect();
          return { left: r.left - grid.left, right: grid.right - r.right, top: r.top, width: r.width };
        });
      });
    };
    const near = (a, b) => Math.abs(a - b) <= 1.5;

    const tablet = await layout(820);
    const last = tablet[4];
    expect(near(last.width, tablet[0].width), "tablet: last card same width as the others").toBe(true);
    expect(near(last.left, last.right), "tablet: last card centred").toBe(true);

    const desktop = await layout(1366);
    expect(near(desktop[3].top, desktop[4].top), "desktop: cards 4 and 5 share a row").toBe(true);
    expect(near(desktop[3].left, 0), "desktop: row 2 starts at the left edge").toBe(true);

    const mobile = await layout(375);
    for (const c of mobile) expect(near(c.left, 0) && near(c.right, 0), "mobile: full-width cards").toBe(true);
  });

  test("TC-E3 WhyChooseUs has no horizontal overflow", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await scrollToWhyChooseUs(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
});
