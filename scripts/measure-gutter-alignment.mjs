import { chromium } from "playwright";

const URL = "http://localhost:3000/dev/block-showcase";

/** @param {import('playwright').Page} page */
async function measureRow(page, label, rowSelector) {
  const row = page.locator(rowSelector).first();
  await row.scrollIntoViewIfNeeded();
  await row.hover();
  await page.waitForTimeout(200);

  const result = await row.evaluate((el) => {
    const gutter = el.querySelector(".canvas-block-gutter");
    if (gutter instanceof HTMLElement) {
      gutter.style.opacity = "1";
    }
    const field =
      el.querySelector(
        "[data-canvas-row-content] textarea, [data-canvas-row-content] input"
      ) ??
      el.querySelector(
        "[data-canvas-row-content] h1, [data-canvas-row-content] h2, [data-canvas-row-content] h3, [data-canvas-row-content] h4, [data-canvas-row-content] p"
      );
    const plus = gutter?.querySelector('button[aria-label="Insert block"]');
    const grip = gutter?.querySelector('button[aria-label="Block actions"]');

    if (!(gutter && field && plus && grip)) {
      return {
        error: "missing elements",
        hasGutter: Boolean(gutter),
        hasField: Boolean(field),
      };
    }

    const gutterStyle = getComputedStyle(gutter);
    const fieldStyle = getComputedStyle(field);
    const plusRect = plus.getBoundingClientRect();
    const gripRect = grip.getBoundingClientRect();
    const fieldRect = field.getBoundingClientRect();

    let firstLineCenter = fieldRect.top + fieldRect.height / 2;
    if (field instanceof HTMLTextAreaElement && field.value.length > 0) {
      const range = document.createRange();
      range.setStart(field, 0);
      range.setEnd(field, 1);
      const lineRects = range.getClientRects();
      const firstLine = lineRects[0];
      if (firstLine) {
        firstLineCenter = firstLine.top + firstLine.height / 2;
      }
    }

    const plusCenter = plusRect.top + plusRect.height / 2;
    const gripCenter = gripRect.top + gripRect.height / 2;

    return {
      gutterOpacity: gutterStyle.opacity,
      gutterPaddingTop: gutterStyle.paddingTop,
      gutterLineHeight: gutterStyle.lineHeight,
      gutterFontSize: gutterStyle.fontSize,
      fieldPaddingTop: fieldStyle.paddingTop,
      fieldLineHeight: fieldStyle.lineHeight,
      fieldFontSize: fieldStyle.fontSize,
      layoutPaddingTop: getComputedStyle(
        el.querySelector("[data-canvas-row-layout]")
      ).paddingTop,
      firstLineCenter,
      plusCenter,
      gripCenter,
      plusDelta: plusCenter - firstLineCenter,
      gripDelta: gripCenter - firstLineCenter,
    };
  });

  return { label, rowSelector, ...result };
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

try {
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector(".canvas-block-gutter", { timeout: 30_000 });
  await page.waitForTimeout(500);

  const rows = [
    ["Heading 1", '[data-canvas-row-id="showcase-h1"]'],
    ["Heading 2", '[data-canvas-row-id="showcase-h2"]'],
    ["Heading 3", '[data-canvas-row-id="showcase-h3"]'],
    ["Heading 4", '[data-canvas-row-id="showcase-h4"]'],
    ["Text", '[data-canvas-row-id="showcase-text"]'],
    ["Divider section", '[data-canvas-row-id="showcase-section-headings"]'],
  ];

  const measurements = [];
  for (const [label, selector] of rows) {
    measurements.push(await measureRow(page, label, selector));
  }

  const maxAbsDelta = Math.max(
    ...measurements
      .filter((m) => typeof m.plusDelta === "number")
      .map((m) => Math.abs(m.plusDelta))
  );

  console.log(JSON.stringify({ maxAbsDelta, measurements }, null, 2));
  if (maxAbsDelta > 1) {
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
