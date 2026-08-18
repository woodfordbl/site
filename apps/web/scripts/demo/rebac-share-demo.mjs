// biome-ignore-all lint: throwaway demo/probe script driven manually against a dev server.
/**
 * Two-browser ReBAC sharing demo against a running dev server (pnpm dev +
 * local Postgres). Proves page-level access control end to end, live in both
 * browsers with no reloads during the access transitions:
 *
 * 1. Alice signs up (personal workspace), invites Bob; Bob signs up in a
 *    SECOND isolated browser and accepts.
 * 2. Alice creates a page; Bob (workspace-member baseline = edit) opens it,
 *    edits it, and the edit syncs live to Alice.
 * 3. Alice opens the Share dialog; sets visibility -> Private: Bob's open
 *    page vanishes live into the not-found state.
 * 4. Alice grants Bob `view`: the page reappears in Bob's sidebar live; Bob
 *    opens it and gets the "View only" pill + the read-only canvas.
 * 5. While view-only, a direct POST /api/sync/mutate from Bob's browser is
 *    rejected with HTTP 403 (the honest denial proof — UI affordances hide).
 * 6. Alice upgrades Bob to `edit`: Bob's editor swaps back in live and his
 *    edit syncs to Alice.
 * 7. Alice removes Bob's grant (visibility still Private): Bob's page
 *    vanishes live again.
 *
 * Dev-environment workarounds (not part of what is being proven):
 * - Every context aborts the dev toolbar's `/__tsd/**` SSE: in dev the app
 *   holds 5 Electric shape long-polls and Chromium allows ~6 HTTP/1.1
 *   connections per origin, so the extra SSE stream saturates the pool and
 *   signed-in boot hangs forever on a suspended fetch.
 * - Navigation avoids the signed-in home canvas ("/") entirely: shipped page
 *   ids are workspace-agnostic slugs but globally unique in `pages`, so every
 *   workspace after the first fails to seed `home` (boot 403 noise), and the
 *   home canvas's shipped database block crashes the synced-mode editor
 *   (Collection.delete on a block the Electric collection never had). A
 *   nonexistent `/p/…` slug — the not-found screen, which keeps the sidebar —
 *   serves as the navigation hub instead.
 *
 * Numbered screenshots land in SHOT_DIR (default: scripts/demo/rebac-shots).
 * Exits non-zero on the first failed step.
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOT_DIR =
  process.env.SHOT_DIR ?? new URL("./rebac-shots", import.meta.url).pathname;
mkdirSync(SHOT_DIR, { recursive: true });

const WAIT = 20_000;
const stamp = Date.now();
const ALICE = `alice-${stamp}@demo.dev`;
const BOB = `bob-${stamp}@demo.dev`;
const BOB_NAME = "Bob Demo";
const PAGE_TITLE = `Access demo ${stamp % 10_000}`;
const ALICE_LINE = "Alice wrote this line as the page owner";
const BOB_LINE_1 = "Bob edited this as a workspace member";
const BOB_LINE_2 = "Bob is editing again after his upgrade";
const SAFE_URL = `${BASE}/p/rebac-demo-safe-harbor`;

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
});

/** Mutations Alice's client POSTs to /api/sync/mutate (sniffed to learn ids). */
const sniffedMutations = [];

async function newPage(name, { sniffMutations = false } = {}) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  // Dev-only workaround (see fileoverview): keep the HTTP/1.1 per-origin
  // connection pool free for the 5 Electric shape long-polls.
  await context.route("**/__tsd/**", (route) => route.abort());
  const page = await context.newPage();
  page.on("pageerror", (e) =>
    console.log(`[${name} pageerror] ${e.message.slice(0, 160)}`)
  );
  if (sniffMutations) {
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        request.url().endsWith("/api/sync/mutate")
      ) {
        try {
          const body = JSON.parse(request.postData() ?? "{}");
          sniffedMutations.push(...(body.mutations ?? []));
        } catch {
          /* non-JSON body: ignore */
        }
      }
    });
  }
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

function pass(message) {
  console.log(`✓ ${message}`);
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exitCode = 1;
  return browser.close().then(() => process.exit(1));
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
}

/** Parks the browser on the not-found screen: app shell + sidebar, no canvas. */
async function gotoSafeHarbor(page) {
  await page.goto(SAFE_URL);
  await page.waitForSelector("text=Page not found", { timeout: 30_000 });
  await page.getByText("New page", { exact: true }).waitFor({ timeout: WAIT });
}

/** Picks `optionLabel` in the base-ui Select opened via `triggerLabel`. */
async function pickSelectOption(page, triggerLabel, optionLabel) {
  await page.getByLabel(triggerLabel).click();
  const option = page.getByRole("option", { name: optionLabel });
  await option.waitFor({ timeout: WAIT });
  await option.click();
}

/** Polls until `probe` resolves truthy; hard-fails the demo on timeout. */
async function pollUntil(probe, message, timeout = WAIT) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await probe()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await fail(`timed out: ${message}`);
}

// On any uncaught failure, capture both browsers before exiting non-zero.
process.on("uncaughtException", async (error) => {
  console.error(`✗ demo failed: ${error?.message ?? error}`);
  try {
    await shot(alicePage, "failure-alice.png");
    await shot(bobPage, "failure-bob.png");
  } catch {
    /* browser already gone */
  }
  process.exit(1);
});
let alicePage;
let bobPage;

// ── Step 1: Alice signs up, invites Bob; Bob signs up and accepts ────────────
const alice = await newPage("alice", { sniffMutations: true });
alicePage = alice;
await signUp(alice, "Alice Demo", ALICE);
await alice.goto(`${BASE}/account`);
await settle(alice);
await alice.getByPlaceholder("teammate@email.com").fill(BOB);
await alice.getByRole("button", { name: "Invite" }).click();
await settle(alice);

const bob = await newPage("bob");
bobPage = bob;
await signUp(bob, BOB_NAME, BOB);
await bob.goto(`${BASE}/account`);
await settle(bob);
await bob.getByRole("button", { name: "Accept" }).click();
await bob.waitForURL(`${BASE}/`, { timeout: 20_000 });
await gotoSafeHarbor(bob);
pass("Step 1: Alice + Bob signed up; Bob accepted the workspace invitation");

// ── Step 2: Alice creates a recognizable page (Share button visible) ─────────
await gotoSafeHarbor(alice);
await alice.getByText("New page", { exact: true }).click();
await alice.waitForSelector("input[data-canvas-field]", { timeout: WAIT });
await settle(alice, 1500);
const titleInput = alice.locator("input[data-canvas-field]");
await titleInput.click();
await alice.keyboard.press("ControlOrMeta+a");
await titleInput.pressSequentially(PAGE_TITLE, { delay: 20 });
await alice.locator("[data-rich-text-field]").first().click();
await alice.waitForTimeout(400);
await alice.keyboard.type(ALICE_LINE);
await settle(alice, 2500);
await alice
  .getByRole("button", { name: "Share", exact: true })
  .waitFor({ timeout: WAIT });
await shot(alice, "01-alice-page-with-share-button.png");
pass("Step 2: Alice created the page; Share button visible (full_access)");

// Learn the page + one block id from Alice's sniffed mutate batches — the
// write-denial probe in step 7 needs real ids.
const pageId = sniffedMutations.find(
  (m) => m.table === "pages" && m.doc?.title === PAGE_TITLE
)?.id;
const blockId = sniffedMutations.find(
  (m) => m.table === "blocks" && m.doc?.pageId === pageId
)?.id;
if (!(pageId && blockId)) {
  await fail("could not sniff page/block ids from Alice's mutate traffic");
}

// ── Step 3: Bob (member baseline = edit) opens the page and edits it ─────────
await bob.getByText(PAGE_TITLE).first().click();
await bob.waitForSelector(`text=${ALICE_LINE}`, { timeout: WAIT });
await bob.waitForSelector("[data-rich-text-field]", { timeout: WAIT });
await bob.getByText(ALICE_LINE).click();
await bob.keyboard.press("End");
await bob.keyboard.press("Enter");
await bob.keyboard.type(BOB_LINE_1);
await alice.waitForSelector(`text=${BOB_LINE_1}`, { timeout: WAIT });
await shot(bob, "02-bob-edits-as-member.png");
await shot(alice, "03-alice-received-bobs-edit.png");
pass("Step 3: Bob saw the page, edited it, and the edit synced live to Alice");

// ── Step 4: Alice opens the Share dialog ─────────────────────────────────────
await alice.getByRole("button", { name: "Share", exact: true }).click();
const dialog = alice.getByRole("dialog");
await dialog.getByText("General access").waitFor({ timeout: WAIT });
await dialog.getByLabel("Page visibility").waitFor({ timeout: WAIT });
await shot(alice, "04-share-dialog-open.png");
pass("Step 4: Share dialog open (general access + grant rows visible)");

// ── Step 5: visibility -> Private; Bob's open page vanishes live ─────────────
await pickSelectOption(alice, "Page visibility", "Private");
await bob.waitForSelector("text=Page not found", { timeout: WAIT });
await shot(bob, "05-bob-page-vanished-private.png");
pass(
  "Step 5: Private visibility revoked Bob live — not-found state, no reload"
);

// Park Bob on a scratch page (in-app navigation, still no reload) so opening
// the demo page again later is a real router navigation, not a same-URL no-op.
await bob.getByText("New page", { exact: true }).click();
await bob.waitForSelector("input[data-canvas-field]", { timeout: WAIT });

// ── Step 6: Alice grants Bob `view`; page returns read-only for Bob ──────────
await pollUntil(
  async () => (await bob.getByText(PAGE_TITLE).count()) === 0,
  "revoked page should have left Bob's sidebar"
);
await pickSelectOption(alice, "Who to share with", BOB_NAME);
await pickSelectOption(alice, "Access level to grant", "Can view");
await dialog.getByRole("button", { name: "Add", exact: true }).click();
await dialog
  .getByLabel(`Access level for ${BOB_NAME}`)
  .waitFor({ timeout: WAIT });
// Live reappearance: the page re-enters Bob's sidebar with no reload.
await bob.getByText(PAGE_TITLE).first().waitFor({ timeout: WAIT });
await bob.getByText(PAGE_TITLE).first().click();
await bob.waitForSelector('[data-testid="canvas-readonly"]', {
  timeout: WAIT,
});
await bob.getByText("View only").waitFor({ timeout: WAIT });
await bob.waitForSelector(`text=${ALICE_LINE}`, { timeout: WAIT });
await pollUntil(
  async () => (await bob.locator("[data-rich-text-field]").count()) === 0,
  "Bob's canvas should expose no editable fields at `view`"
);
await shot(bob, "06-bob-view-only-pill-readonly-canvas.png");
pass(
  "Step 6: view grant restored the page for Bob — View-only pill, read-only canvas"
);

// ── Step 7: write denial at the API while view-only ──────────────────────────
const denial = await bob.evaluate(
  async ({ targetBlockId }) => {
    const workspaceId = decodeURIComponent(
      document.cookie
        .split("; ")
        .find((part) => part.startsWith("site-workspace="))
        ?.slice("site-workspace=".length) ?? ""
    );
    const response = await fetch("/api/sync/mutate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        mutations: [
          {
            table: "blocks",
            op: "update",
            id: targetBlockId,
            doc: { text: "Bob should not be able to write this" },
          },
        ],
      }),
    });
    return { status: response.status, body: await response.text() };
  },
  { targetBlockId: blockId }
);
if (denial.status !== 403) {
  await fail(
    `expected 403 from /api/sync/mutate at view level, got ${denial.status}: ${denial.body.slice(0, 200)}`
  );
}
pass(
  `Step 7: block update from Bob denied with HTTP 403 (${denial.body.trim()})`
);

// ── Step 8: upgrade Bob to `edit`; his editor returns and edits sync ─────────
await pickSelectOption(alice, `Access level for ${BOB_NAME}`, "Can edit");
await alice.keyboard.press("Escape"); // close dialog for a clean screenshot
await dialog.waitFor({ state: "detached", timeout: WAIT });
await bob.waitForSelector("[data-rich-text-field]", { timeout: WAIT });
await pollUntil(
  async () => (await bob.getByText("View only").count()) === 0,
  "the View-only pill should disappear at `edit`"
);
await bob.getByText(BOB_LINE_1).click();
await bob.keyboard.press("End");
await bob.keyboard.press("Enter");
await bob.keyboard.type(BOB_LINE_2);
await alice.waitForSelector(`text=${BOB_LINE_2}`, { timeout: WAIT });
await shot(bob, "07-bob-editor-restored-after-upgrade.png");
await shot(alice, "08-alice-received-upgraded-bobs-edit.png");
pass(
  "Step 8: edit upgrade swapped Bob's editor back in; his edit synced to Alice"
);

// ── Step 9: remove Bob's grant (visibility stays Private) — revoked live ─────
await alice.getByRole("button", { name: "Share", exact: true }).click();
await dialog
  .getByLabel(`Remove access for ${BOB_NAME}`)
  .waitFor({ timeout: WAIT });
// Visibility must still read Private so removal is a true revocation.
const visibilityText = await dialog.getByLabel("Page visibility").innerText();
if (!visibilityText.includes("Private")) {
  await fail(`visibility drifted from Private (reads: ${visibilityText})`);
}
await dialog.getByLabel(`Remove access for ${BOB_NAME}`).click();
await bob.waitForSelector("text=Page not found", { timeout: WAIT });
await shot(bob, "09-bob-revoked-final.png");
pass(
  "Step 9: grant removal revoked Bob live — page vanished again without reload"
);

console.log("\nAll ReBAC demo steps passed.");
await browser.close();
