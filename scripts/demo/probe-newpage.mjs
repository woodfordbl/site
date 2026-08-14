// biome-ignore-all lint: throwaway demo/probe script driven manually against a dev server.
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const SHOT =
  "/tmp/claude-0/-home-user-site/99ce64fa-b8fd-56d7-8bfe-085b7c3529da/scratchpad/demo";

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
});
const page = await (await browser.newContext()).newPage();
page.on("response", async (r) => {
  if (r.url().includes("/api/sync/mutate")) {
    const body = r.status() >= 400 ? await r.text().catch(() => "") : "";
    console.log(`mutate -> ${r.status()} ${body.slice(0, 200)}`);
  }
});
page.on("console", (m) => {
  if (m.type() === "error") {
    console.log("[console.error]", m.text().slice(0, 400));
  }
});

await page.goto(`${BASE}/account`);
await page.waitForTimeout(1500);
await page.getByLabel("Name").fill("Probe User");
await page.getByLabel("Email").fill(`probe-${Date.now()}@x.dev`);
await page.getByLabel("Password").fill("password1234");
await page.getByRole("button", { name: "Create account & workspace" }).click();
await page.waitForURL(`${BASE}/`, { timeout: 20_000 });
await page.waitForTimeout(4000);

await page.getByText("New page", { exact: true }).click();
await page.waitForTimeout(2500);
const title = page.locator("input[data-canvas-field]");
await title.click();
await title.fill("Demo Title");
await page.keyboard.press("Enter");
await page.waitForTimeout(800);
await page.locator("[data-rich-text-field]").first().click();
await page.keyboard.type("Body line here");
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SHOT}/probe-newpage.png` });
await page.waitForTimeout(4000);
await browser.close();
