// Public CV links (<app>/<mobile number>), step by step: publish from the studio,
// open signed-out (desktop + phone), download as a visitor, update, move the
// number, turn off.

const fs = require('node:fs');
const { test, expect } = require('@playwright/test');
const { signUpAndSignIn, openStudio, freshPhone } = require('./career-helpers');

test.use({ launchOptions: { slowMo: 0 } });
test.describe.configure({ timeout: 90_000 });

test.describe('Public CV link', () => {
  test('publish → visitor views & downloads → update → move number → turn off', async ({ page, request, browser, baseURL }) => {
    await signUpAndSignIn(page, request, 'Public Link');
    page.on('dialog', (d) => d.accept());
    await openStudio(page, '/career/cv');
    await page.getByLabel('Load a sample persona').selectOption('fullstack');

    // Step 1: no phone → publishing is blocked with a clear hint
    await page.getByLabel('Phone').fill('');
    await page.getByTestId('cv-public-link').click();
    const panel = page.getByTestId('cv-public-panel');
    await expect(panel).toContainText('<your mobile number>');
    await expect(panel).toContainText('Add your mobile number to the CV first');
    await expect(page.getByTestId('cv-publish')).toBeDisabled();

    // Step 2: add a number → the panel previews the exact link
    const phone = freshPhone();
    await page.getByLabel('Phone').fill(`+91 ${phone}`);
    const slug = `91${phone}`;
    await expect(panel).toContainText(`${baseURL}/${slug}`);
    await expect(panel).toContainText('shows your email and phone');

    // Step 3: pick a template, then publish
    await page.locator('.cp-tpl', { hasText: 'Executive Classic' }).click();
    await page.getByTestId('cv-publish').click();
    await expect(page.getByTestId('cv-public-url')).toHaveText(`${baseURL}/${slug}`);
    await expect(page.getByTestId('cv-public-link')).toHaveText('Public link · on');
    await expect(page.locator('.cp-export__pop')).toContainText('Your CV is live');

    // Step 4: a signed-out visitor opens the link (phone-sized)
    const visitor = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
    const v = await visitor.newPage();
    await v.goto(`/${slug}`);
    await expect(v.getByTestId('pcv-paper')).toBeVisible();
    await expect(v.locator('.cv-paper h1')).toHaveText('Aarav Mehta');
    await expect(v.locator('.cv-paper')).toHaveClass(/cv-executive/); // the published template
    await expect(v).toHaveTitle('Aarav Mehta | CV');
    expect(await v.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    // Step 5: the visitor downloads PDF and CSV
    const [pdf] = await Promise.all([v.waitForEvent('download', { timeout: 30_000 }), v.getByTestId('pcv-pdf').click()]);
    expect(pdf.suggestedFilename()).toBe('Aarav-Mehta-CV.pdf');
    expect(fs.readFileSync(await pdf.path()).subarray(0, 5).toString()).toBe('%PDF-');
    const [csv] = await Promise.all([v.waitForEvent('download'), v.getByTestId('pcv-csv').click()]);
    expect(fs.readFileSync(await csv.path(), 'utf8')).toContain('Contact,Name,,,,Aarav Mehta');

    // Step 6: edits don't go live until "Update public CV"
    await page.getByLabel('Professional title').fill('Principal Full-Stack Engineer');
    await v.reload();
    await expect(v.locator('.cv-paper .cv-title').first()).toHaveText('Full-Stack Developer');
    await page.getByTestId('cv-publish').click(); // "Update public CV"
    await expect(page.locator('.cp-export__pop')).toContainText('Public CV updated');
    await v.reload();
    await expect(v.locator('.cv-paper .cv-title').first()).toHaveText('Principal Full-Stack Engineer');

    // Step 7: changing the number moves the link; the old one stops working
    const phone2 = freshPhone();
    await page.getByLabel('Phone').fill(phone2);
    await expect(page.getByTestId('cv-public-panel')).toContainText('Your phone number changed');
    await page.getByTestId('cv-publish').click();
    await expect(page.getByTestId('cv-public-url')).toHaveText(`${baseURL}/${phone2}`);
    await v.goto(`/${slug}`);
    await expect(v.getByTestId('pcv-missing')).toContainText('No CV at this link');
    await v.goto(`/${phone2}`);
    await expect(v.locator('.cv-paper h1')).toHaveText('Aarav Mehta');

    // Step 8: Copy puts the link on the clipboard
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByTestId('cv-public-panel').getByRole('button', { name: 'Copy' }).click();
    await expect(page.getByTestId('cv-public-panel').getByRole('button', { name: 'Copied' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${baseURL}/${phone2}`);

    // Step 9: turn the link off
    await page.getByTestId('cv-unpublish').click();
    await expect(page.locator('.cp-export__pop')).toContainText('Link turned off');
    await expect(page.getByTestId('cv-public-link')).toHaveText('Public link');
    await v.reload();
    await expect(v.getByTestId('pcv-missing')).toBeVisible();
    await visitor.close();
  });

  test('a number already used by another member is refused', async ({ page, request }) => {
    const phone = freshPhone();
    // Step 1: someone else publishes the number first (API)
    const other = await (await request.post('/api/auth/register', { data: { name: 'First Owner', email: `owner-${Date.now()}@example.com`, password: 'test-pass-1234' } })).json();
    const first = await request.put('/api/career/public-cv', { headers: { Authorization: `Bearer ${other.token}` }, data: { cv: { name: 'First Owner', phone }, template: 'ats-pro' } });
    expect(first.status()).toBe(200);

    // Step 2: this member tries the same number in the UI
    await signUpAndSignIn(page, request, 'Second Owner');
    await openStudio(page, '/career/cv');
    await page.getByLabel('Full name').fill('Second Owner');
    await page.getByLabel('Phone').fill(phone);
    await page.getByTestId('cv-public-link').click();
    await page.getByTestId('cv-publish').click();
    await expect(page.locator('.cp-export__pop .aa-msg')).toContainText('already used by another member');
    await expect(page.getByTestId('cv-public-url')).toHaveCount(0);
  });

  test('a link that was never published shows the "No CV" page', async ({ page }) => {
    await page.goto('/1234567');
    await expect(page.getByTestId('pcv-missing')).toContainText('No CV at this link');
    await expect(page.getByTestId('pcv-pdf')).toHaveCount(0);
  });
});
