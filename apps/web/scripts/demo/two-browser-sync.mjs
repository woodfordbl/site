// biome-ignore-all lint: throwaway demo/probe script driven manually against a dev server.
/**
 * Two-browser real-time sync demo against a running dev server (pnpm dev +
 * local Postgres). Proves the goal end-to-end:
 *
 * 1. Anonymous default: the shipped blog renders (local-first playground).
 * 2. Alice creates an account (email/password) → personal workspace.
 * 3. Alice creates a page and writes content (synced through Electric-protocol
 *    collections).
 * 4. Alice invites Bob; Bob signs up in a SECOND isolated browser, accepts the
 *    invitation in-app, and opens the same workspace.
 * 5. Both browsers show the same page; edits propagate live in both
 *    directions without reloads.
 *
 * Screenshots land in SHOT_DIR (default: scripts/demo/shots).
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOT_DIR =
  process.env.SHOT_DIR ?? new URL("./shots", import.meta.url).pathname;
mkdirSync(SHOT_DIR, { recursive: true });

const stamp = Date.now();
const ALICE = `alice-${stamp}@demo.dev`;
const BOB = `bob-${stamp}@demo.dev`;
const PAGE_TITLE = `Team plan ${stamp % 10_000}`;
const ALICE_LINE = "Alice wrote this in browser A";
const BOB_LINE = "Bob replied from browser B";

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
});

async function newPage(name) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  page.on("pageerror", (e) =>
    console.log(`[${name} pageerror] ${e.message.slice(0, 160)}`)
  );
  return page;
}

async function shot(page, file) {
  await page.screenshot({ path: `${SHOT_DIR}/${file}` });
  console.log(`📸 ${file}`);
}

async function settle(page, ms = 1500) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(ms);
}

async function signUp(page, name, email) {
  await page.goto(`${BASE}/account`);
  await settle(page);
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password1234");
  await page
    .getByRole("button", { name: "Create account & workspace" })
    .click();
  await page.waitForURL(`${BASE}/`, { timeout: 20_000 });
  await settle(page, 3000);
}

// ── 1. Anonymous default: shipped blog ───────────────────────────────────────
const alice = await newPage("alice");
await alice.goto(`${BASE}/`);
await alice.waitForSelector("h1", { timeout: 30_000 }).catch(() => {});
await settle(alice, 2500);
// Known dev-only fresh-profile hiccup (pre-existing StrictMode double-seed):
// self-heals on reload.
if ((await alice.getByText("Something went wrong!").count()) > 0) {
  await alice.reload();
  await settle(alice, 2500);
}
await shot(alice, "1-anonymous-blog.png");

// ── 2. Alice signs up ────────────────────────────────────────────────────────
await signUp(alice, "Alice Demo", ALICE);
await shot(alice, "2-alice-signed-in-workspace.png");

// ── 3. Alice creates a page and writes a line ────────────────────────────────
await alice.getByText("New page", { exact: true }).click();
await settle(alice, 2000);
// Rename via the canvas title input (typed keys, committed by moving focus
// into the body), then write the first body block.
const titleInput = alice.locator("input[data-canvas-field]");
await titleInput.click();
await alice.keyboard.press("ControlOrMeta+a");
await titleInput.pressSequentially(PAGE_TITLE, { delay: 20 });
await alice.locator("[data-rich-text-field]").first().click();
await alice.waitForTimeout(400);
await alice.keyboard.type(ALICE_LINE);
await settle(alice, 3000);
await shot(alice, "3-alice-created-page.png");

// ── 4. Alice invites Bob ─────────────────────────────────────────────────────
await alice.goto(`${BASE}/account`);
await settle(alice);
await alice.getByPlaceholder("teammate@email.com").fill(BOB);
await alice.getByRole("button", { name: "Invite" }).click();
await settle(alice);
await shot(alice, "4-alice-invited-bob.png");

// ── 5. Bob signs up in a second browser and accepts ──────────────────────────
const bob = await newPage("bob");
await signUp(bob, "Bob Demo", BOB);
await bob.goto(`${BASE}/account`);
await settle(bob, 2000);
await shot(bob, "5-bob-sees-invitation.png");
await bob.getByRole("button", { name: "Accept" }).click();
await bob.waitForURL(`${BASE}/`, { timeout: 20_000 });
await settle(bob, 3000);
await shot(bob, "6-bob-in-alices-workspace.png");

// ── 6. Bob opens the shared page ─────────────────────────────────────────────
await bob.getByText(PAGE_TITLE).first().click();
await settle(bob, 2000);
await bob.waitForSelector(`text=${ALICE_LINE}`, { timeout: 15_000 });
await shot(bob, "7-bob-sees-alices-content.png");
console.log("✓ Bob sees Alice's page + content in browser B");

// ── 7. Live edit A → B (no reloads) ──────────────────────────────────────────
await alice.goto(`${BASE}/`);
await settle(alice, 2000);
await alice.getByText(PAGE_TITLE).first().click();
await settle(alice, 1500);
const aliceLive = `Live from A at ${new Date().toISOString().slice(11, 19)}`;
await alice.getByText(ALICE_LINE).click();
await alice.keyboard.press("End");
await alice.keyboard.press("Enter");
await alice.keyboard.type(aliceLive);
await bob.waitForSelector(`text=${aliceLive}`, { timeout: 20_000 });
await shot(bob, "8-bob-received-live-edit.png");
console.log("✓ Alice's live edit appeared in Bob's browser without reload");

// ── 8. Live edit B → A ───────────────────────────────────────────────────────
await bob.getByText(aliceLive).click();
await bob.keyboard.press("End");
await bob.keyboard.press("Enter");
await bob.keyboard.type(BOB_LINE);
await alice.waitForSelector(`text=${BOB_LINE}`, { timeout: 20_000 });
await shot(alice, "9-alice-received-bobs-edit.png");
await shot(bob, "9b-bob-view.png");
console.log("✓ Bob's edit appeared in Alice's browser without reload");

console.log("\nAll demo steps passed.");
await browser.close();
