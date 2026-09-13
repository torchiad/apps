import { test, expect } from '@playwright/test';

// Visual verifier: loads each app's real, built page and confirms it renders
// and runs without JS errors. This is the last automated gate before a
// change is considered safe to merge.
const APPS = [
    { path: '/apps/', heading: null },
    { path: '/apps/gnomon/', heading: 'shadows' },
    { path: '/apps/hose-planner/', heading: 'watering' },
    { path: '/apps/rss-reader/', heading: 'broadsheet' },
    { path: '/apps/shoreline/', heading: 'shoreline' },
    { path: '/apps/cookbook/', heading: null },
];

for (const app of APPS) {
    test(`${app.path} loads with no script errors`, async ({ page }) => {
        // Uncaught exceptions in the app's own code are always a hard failure.
        const pageErrors = [];
        page.on('pageerror', err => pageErrors.push(String(err)));

        // Console "errors" from failed network requests (fonts, map tiles,
        // geocoding, RSS feeds) are noise here — this runner has no general
        // internet access — not a signal about the code under test. Only
        // console.error calls made by application script itself count.
        const scriptErrors = [];
        page.on('console', msg => {
            if (msg.type() !== 'error') return;
            if (/Failed to load resource/i.test(msg.text())) return;
            scriptErrors.push(msg.text());
        });

        const response = await page.goto(app.path);
        expect(response.status()).toBeLessThan(400);

        if (app.heading) {
            await expect(page.locator('h1').first()).toContainText(app.heading, { ignoreCase: true });
        }

        expect(pageErrors, `uncaught exceptions on ${app.path}`).toEqual([]);
        expect(scriptErrors, `console.error calls on ${app.path}`).toEqual([]);
    });
}

test('hub search filters the app list', async ({ page }) => {
    await page.goto('/apps/');
    const initialCount = await page.locator('.tile').count();
    expect(initialCount).toBeGreaterThan(0);

    await page.fill('#q', 'zzzznomatch');
    await expect(page.locator('.empty')).toBeVisible();

    await page.fill('#q', '');
    await expect(page.locator('.tile')).toHaveCount(initialCount);
});
