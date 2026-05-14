const { chromium } = require("playwright");

const baseUrl = process.env.SMOKE_URL ?? "http://127.0.0.1:5173/";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];

  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  try {
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.locator('[data-action="start-title"]').click();
    for (let index = 0; index < 4; index += 1) {
      await page.locator('[data-action="count-plus"]').click();
    }

    const cardCount = await page.locator(".entrant-card").count();
    await page.locator('input[data-player-name="0"]').fill("Minji");
    await page.locator('input[data-player-name="7"]').fill("Jisu");
    await page.locator('[data-action="start-race"]').click();

    await page.waitForSelector("canvas", { timeout: 10000 });
    await page.waitForSelector("#hud-leaderboard .leader-row", { timeout: 10000 });
    await page.waitForTimeout(3000);

    const hudRows = await page.locator("#hud-leaderboard .leader-row").count();
    const progressMarkers = await page.locator(".race-progress__marker").count();
    const speedDials = await page.locator(".speed-dial").count();
    const canvasBox = await page.locator("canvas").boundingBox();
    const trackName = await page.locator("#hud-track").innerText();

    await page.waitForSelector(".results-hero h1", { timeout: 180000 });
    const resultRows = await page.locator(".result-row").count();
    const buyerText = await page.locator(".results-hero h1").innerText();

    const result = {
      cardCount,
      hudRows,
      progressMarkers,
      speedDials,
      hasCanvas: Boolean(canvasBox && canvasBox.width > 0 && canvasBox.height > 0),
      trackName,
      resultRows,
      buyerText,
      errors
    };

    console.log(JSON.stringify(result, null, 2));

    if (
      cardCount !== 8 ||
      hudRows !== 8 ||
      progressMarkers !== 8 ||
      speedDials !== 8 ||
      resultRows !== 8 ||
      !result.hasCanvas ||
      errors.length > 0
    ) {
      process.exitCode = 1;
    }
  } catch (error) {
    const bodyText = await page.locator("body").innerText({ timeout: 1000 }).catch(() => "");
    console.error(JSON.stringify({ errors, bodyText: bodyText.slice(0, 1200) }, null, 2));
    throw error;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
