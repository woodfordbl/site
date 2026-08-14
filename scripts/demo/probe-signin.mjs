// biome-ignore-all lint: throwaway demo/probe script driven manually against a dev server.
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const SHOT_DIR =
  process.env.SHOT_DIR ??
  "/tmp/claude-0/-home-user-site/99ce64fa-b8fd-56d7-8bfe-085b7c3529da/scratchpad/demo";
const email = `alice-${Date.now()}@example.com`;

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
});
const page = await context.newPage();
const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
page.on("requestfailed", (r) =>
  logs.push(`[reqfail] ${r.method()} ${r.url()} ${r.failure()?.errorText}`)
);

// 1. Anonymous default: shipped blog SSR.
await page.goto(`${BASE}/`);
await page.waitForTimeout(2500);
await page.screenshot({ path: `${SHOT_DIR}/01-anonymous-blog.png` });
console.log(
  "anon h1:",
  await page
    .locator("h1")
    .first()
    .textContent()
    .catch(() => "n/a")
);

// 2. Create an account through the UI.
await page.goto(`${BASE}/account`);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SHOT_DIR}/02-account-page.png` });
await page.getByLabel("Name").fill("Alice Demo");
await page.getByLabel("Email").fill(email);
await page.getByLabel("Password").fill("password1234");
await page.getByRole("button", { name: "Create account & workspace" }).click();
await page.waitForURL(`${BASE}/`, { timeout: 15_000 });
await page.waitForTimeout(4000);
await page.screenshot({ path: `${SHOT_DIR}/03-signed-in-home.png` });

console.log(
  "cookies:",
  (await context.cookies()).map((c) => c.name).join(", ")
);
console.log("--- console log tail ---");
for (const line of logs.slice(-30)) {
  console.log(line);
}
console.log("email:", email);
await browser.close();
