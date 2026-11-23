// Resume studio (/career) — every step of the masterCV workflow in a real browser:
// empty state → demo scan → live ATS analyzer → real CV upload (picker + drag & drop)
// → one CV across Generator / AI builder / booking modal / My Profile & Sync →
// save & sync → Jobs readiness → experts → mobile layout.
// Needs the web app built first (npm run build).

const fs = require('node:fs');
const { test, expect } = require('@playwright/test');
const { signUpAndSignIn, openStudio, studioNav, statusAts, savedProfile, textCv } = require('./career-helpers');

// These flows have many steps — run them at full speed (the ui project slows clicks by default).
test.use({ launchOptions: { slowMo: 0 } });
test.describe.configure({ timeout: 90_000 });

test.describe('Resume studio: dashboard & scan', () => {
  test('a new member sees an empty studio with the upload zone, demos and a red status', async ({ page, request }) => {
    await signUpAndSignIn(page, request, 'Empty Studio', { viaForm: true }); // the real login form
    // Step 1: the Resume rail item opens the studio dashboard
    await page.getByTestId('rail-career').click();
    await expect(page).toHaveURL(/\/career$/);
    await expect(page.locator('.aa-topbar__title')).toHaveText('Career Dashboard');

    // Step 2: sidebar groups and items
    for (const group of ['Overview', 'Build', 'Prepare', 'Settings']) await expect(page.locator('.aa-nav__label', { hasText: group })).toBeVisible();
    for (const item of ['Dashboard', 'CV Generator', 'AI CV Builder', 'Expert CV Review', 'Experts Directory', 'My Profile & Sync']) {
      await expect(page.locator('.aa-nav__item', { hasText: item })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: /Back to Huddle/ })).toBeVisible();

    // Step 3: status bar — no CV file, low ATS, red readiness
    await expect(page.locator('.st-chip__text')).toHaveText('No CV file');
    expect(await statusAts(page)).toBeLessThan(20);
    await expect(page.getByTestId('status-ready')).toHaveClass(/st-badge--crit/);

    // Step 4: upload zone and the three demo personas
    await expect(page.getByTestId('cv-drop')).toContainText('Drag & drop your CV here');
    await expect(page.getByTestId('cv-drop')).toContainText('PDF, DOC, DOCX or TXT');
    for (const id of ['fullstack', 'java', 'support']) await expect(page.getByTestId(`demo-${id}`)).toBeVisible();

    // Step 5: readiness card and analyzer are present
    await expect(page.getByTestId('readiness-card')).toContainText('Applying needs 70%');
    await expect(page.getByTestId('ats-analyzer')).toContainText('Live Skill & ATS Analyzer');
  });

  test('a demo persona runs the 4-stage optical scan, then loads into masterCV (unsaved)', async ({ page, request }) => {
    await signUpAndSignIn(page, request, 'Demo Scan');
    await openStudio(page);
    const atsBefore = await statusAts(page);

    // Step 1: start the scan
    await page.getByTestId('demo-java').click();
    const scan = page.getByTestId('cv-scan');
    await expect(scan).toBeVisible();
    await expect(scan).toContainText('Optical CV scan');
    await expect(scan.locator('.st-scan__laser')).toBeVisible();
    // demos are disabled while scanning
    await expect(page.getByTestId('demo-fullstack')).toBeDisabled();

    // Step 2: the four stages, in order
    const steps = scan.locator('.st-scan__steps li');
    await expect(steps).toHaveText(['1Parsing Document Structure', '2Extracting Core Skills', '3Benchmarking ATS Keywords', '4Syncing Profile & Jobs'].map((t) => new RegExp(t.slice(1))));
    await expect(steps.nth(0)).toHaveClass(/is-on|is-done/);
    // Step 3: data isn't applied until the sync stage
    await expect(page.locator('.st-chip__text')).toHaveText('No CV file');

    // Step 4: completes at 100% with every stage ticked
    await expect(scan).toHaveClass(/is-done/, { timeout: 10_000 });
    await expect(page.getByTestId('scan-pct')).toHaveText('100%');
    for (let i = 0; i < 4; i++) await expect(steps.nth(i)).toHaveClass(/is-done/);
    await expect(scan).toContainText('not saved to your profile');

    // Step 5: masterCV now holds the sample — status bar, analyzer and readiness all follow
    await expect(page.locator('.st-chip__text')).toHaveText('Sample · Java Backend Developer');
    await expect(page.locator('.st-dot')).toHaveText('Unsaved');
    expect(await statusAts(page)).toBeGreaterThan(atsBefore);
    await expect(page.getByTestId('ats-role')).toHaveValue('java');
    await expect(page.getByTestId('readiness-card')).toContainText('Sneha Kulkarni');
    await expect(page.getByTestId('readiness-card')).toContainText('Sample CV in use');

    // Step 6: Done closes the scan panel and shows the drop zone again
    await scan.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByTestId('cv-drop')).toBeVisible();
  });

  test('uploading a real CV (file picker) scans, saves to the profile and turns readiness green', async ({ page, request }) => {
    const { token } = await signUpAndSignIn(page, request, 'Picker Upload');
    await openStudio(page);

    // Step 1: pick a .txt CV
    await page.getByTestId('cv-file-input').setInputFiles({ name: 'rahul-cv.txt', mimeType: 'text/plain', buffer: textCv() });
    // Step 2: the scan runs and completes
    await expect(page.getByTestId('cv-scan')).toBeVisible();
    await expect(page.getByTestId('cv-scan')).toHaveClass(/is-done/, { timeout: 15_000 });
    await expect(page.getByTestId('cv-scan')).toContainText('Saved to your profile');

    // Step 3: status bar shows the file, in sync (no "Unsaved")
    await expect(page.locator('.st-chip__text')).toHaveText('rahul-cv.txt');
    await expect(page.locator('.st-dot')).toHaveCount(0);
    await expect(page.getByTestId('cv-upload-card').locator('.st-pill')).toContainText('rahul-cv.txt');

    // Step 4: the parsed CV filled the profile on the server
    const profile = await savedProfile(request, token);
    expect(profile.hasCv).toBe(true);
    expect(profile.cvName).toBe('rahul-cv.txt');
    expect(profile.skills).toEqual(expect.arrayContaining(['Zendesk']));

    // Step 5: readiness card reports the file and sync state
    await expect(page.getByTestId('readiness-card')).toContainText('rahul-cv.txt');
    await expect(page.getByTestId('readiness-card')).toContainText('In sync with your profile and Jobs');
  });

  test('drag & drop upload works, and an unsupported file shows a scan error with Try again', async ({ page, request }) => {
    await signUpAndSignIn(page, request, 'Drop Upload');
    await openStudio(page);

    // Step 1: an image is rejected
    await page.getByTestId('cv-file-input').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('not a cv') });
    await expect(page.getByTestId('cv-scan')).toHaveClass(/is-error/);
    await expect(page.getByTestId('cv-scan')).toContainText('Scan failed');
    await expect(page.getByTestId('cv-scan')).toContainText('isn’t allowed');
    // Step 2: Try again returns to the drop zone
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByTestId('cv-drop')).toBeVisible();

    // Step 3: drag a CV onto the zone
    const dataTransfer = await page.evaluateHandle((text) => {
      const dt = new DataTransfer();
      dt.items.add(new File([text], 'dropped-cv.txt', { type: 'text/plain' }));
      return dt;
    }, textCv({ name: 'Dropped Person' }).toString('utf8'));
    await page.getByTestId('cv-drop').dispatchEvent('dragover', { dataTransfer });
    await expect(page.getByTestId('cv-drop')).toHaveClass(/is-over/);
    await page.getByTestId('cv-drop').dispatchEvent('drop', { dataTransfer });
    await expect(page.getByTestId('cv-scan')).toHaveClass(/is-done/, { timeout: 15_000 });
    await expect(page.locator('.st-chip__text')).toHaveText('dropped-cv.txt');
  });
});

test.describe('Resume studio: Live Skill & ATS Analyzer', () => {
  test('adding / removing skills and switching role re-scores instantly', async ({ page, request }) => {
    await signUpAndSignIn(page, request, 'Analyzer');
    await openStudio(page);
    await page.getByTestId('demo-support').click();
    await expect(page.getByTestId('cv-scan')).toHaveClass(/is-done/, { timeout: 10_000 });

    const ring = page.getByTestId('ats-score');
    const missing = page.getByTestId('ats-missing').locator('button');
    const start = await statusAts(page);
    await expect(ring).toHaveText(String(start)); // ring and status bar agree

    // Step 1: tap a missing keyword → it moves to matched, joins skills, score rises
    const keyword = (await missing.first().textContent()).trim();
    await missing.first().click();
    await expect(page.locator('.st-kw-chip.is-hit', { hasText: keyword })).toBeVisible();
    await expect(page.getByTestId('skill-chips')).toContainText(keyword);
    const afterKeyword = await statusAts(page);
    expect(afterKeyword).toBeGreaterThan(start);

    // Step 2: type several skills at once (comma separated)
    await page.getByTestId('skill-input').fill('Freshdesk, Ticketing, Escalation Handling');
    await page.getByTestId('skill-input').press('Enter');
    await expect(page.getByTestId('skill-chips')).toContainText('Ticketing');
    await expect(page.getByTestId('skill-input')).toHaveValue('');
    const afterTyped = await statusAts(page);
    expect(afterTyped).toBeGreaterThan(afterKeyword);

    // Step 3: duplicates are ignored
    const count = await page.getByTestId('skill-chips').locator('.st-chip-skill').count();
    await page.getByTestId('skill-input').fill('ticketing');
    await page.getByTestId('skill-input').press('Enter');
    await expect(page.getByTestId('skill-chips').locator('.st-chip-skill')).toHaveCount(count);

    // Step 4: removing a skill lowers the score
    await page.getByRole('button', { name: 'Remove Ticketing' }).click();
    await expect(page.getByTestId('skill-chips')).not.toContainText('Ticketing');
    expect(await statusAts(page)).toBeLessThan(afterTyped);

    // Step 5: switching the target role changes the keyword set
    await page.getByTestId('ats-role').selectOption('java');
    await expect(page.getByTestId('ats-analyzer')).toContainText('Java Backend Developer keywords');
    await expect(page.getByTestId('ats-missing')).toContainText('Spring Boot');
    // Step 6: back to auto-detect
    await page.getByTestId('ats-role').selectOption('');
    await expect(page.getByTestId('ats-analyzer')).toContainText('Customer Support / Call Center keywords');

    // Step 7: the breakdown shows all six parts
    for (const part of ['keywords', 'Skills depth', 'Professional summary', 'Quantified impact', 'Structure & contact', 'CV file attached']) {
      await expect(page.locator('.st-parts')).toContainText(part);
    }
  });
});

test.describe('Resume studio: one CV everywhere (masterCV)', () => {
  test('an edit in any tab shows in every other tab and modal, survives reload, then saves & syncs', async ({ page, request }) => {
    const { token } = await signUpAndSignIn(page, request, 'Sync Everywhere');
    page.on('dialog', (d) => d.accept());
    await openStudio(page);
    await page.getByTestId('demo-fullstack').click();
    await expect(page.getByTestId('cv-scan')).toHaveClass(/is-done/, { timeout: 10_000 });

    // Step 1: CV Generator shows the same CV; edit the title there
    await studioNav(page, 'CV Generator');
    await expect(page).toHaveURL(/\/career\/cv$/);
    await expect(page.getByLabel('Full name')).toHaveValue('Aarav Mehta');
    await expect(page.getByTestId('gen-ats')).toHaveText(String(await statusAts(page)));
    await page.getByLabel('Professional title').fill('Lead Full-Stack Engineer');
    await expect(page.locator('.cp-preview-wrap .cv-title')).toHaveText('Lead Full-Stack Engineer');

    // Step 2: AI CV Builder preview has the edit (no copy step)
    await page.route('**/api/career/cv-chat/status', (r) => r.fulfill({ json: { configured: true } }));
    await studioNav(page, 'AI CV Builder');
    await expect(page.getByTestId('chat-preview').locator('.cv-title')).toHaveText('Lead Full-Stack Engineer');
    await expect(page.getByTestId('chat-ats')).toHaveText(String(await statusAts(page)));

    // Step 3: the booking modal attaches the same synced CV
    await studioNav(page, 'Expert CV Review');
    await page.getByRole('button', { name: /Book 30-Min Session/ }).click();
    await expect(page.getByTestId('booking-cv')).toContainText('Sample · Full-Stack Developer');
    await expect(page.getByTestId('booking-cv')).toContainText(`ATS ${await statusAts(page)}`);
    await page.locator('.cp-modal-close').click();

    // Step 4: My Profile & Sync shows it as unsaved
    await studioNav(page, 'My Profile & Sync');
    await expect(page.getByTestId('sync-title')).toHaveValue('Lead Full-Stack Engineer');
    await expect(page.getByTestId('sync-state')).toHaveText('Unsaved changes');

    // Step 5: an edit on the sync page shows back in the Generator
    await page.getByTestId('sync-summary').fill('Full-stack engineer with 6 years building React and Node.js products used by 200K+ shoppers.');
    await studioNav(page, 'CV Generator');
    await expect(page.locator('.cp-preview-wrap .cv-paper')).toContainText('200K+ shoppers');

    // Step 6: unsaved work survives a full reload
    await page.reload();
    await expect(page.getByTestId('studio-status')).toBeVisible();
    await expect(page.locator('.st-dot')).toHaveText('Unsaved');
    await expect(page.getByLabel('Professional title')).toHaveValue('Lead Full-Stack Engineer');

    // Step 7: nothing reached the server yet
    expect((await savedProfile(request, token)).headline || '').not.toBe('Lead Full-Stack Engineer');

    // Step 8: Save & sync everywhere
    await studioNav(page, 'My Profile & Sync');
    await page.getByTestId('sync-save').click();
    await expect(page.getByTestId('sync-state')).toHaveText('In sync');
    await expect(page.getByTestId('sync-save')).toBeDisabled();
    await expect(page.locator('.st-dot')).toHaveCount(0);
    const saved = await savedProfile(request, token);
    expect(saved.headline).toBe('Lead Full-Stack Engineer');
    expect(saved.bio).toContain('200K+ shoppers');
    expect(saved.skills).toEqual(expect.arrayContaining(['React', 'Node.js']));
    expect(saved.experience[0].company).toBe('CartNest');

    // Step 9: Reload from saved profile discards a later local edit
    await page.getByTestId('sync-title').fill('Temporary title');
    await expect(page.getByTestId('sync-state')).toHaveText('Unsaved changes');
    await page.getByRole('button', { name: 'Reload from saved profile' }).click();
    await expect(page.getByTestId('sync-title')).toHaveValue('Lead Full-Stack Engineer');
    await expect(page.getByTestId('sync-state')).toHaveText('In sync');
  });

  test('the dashboard Save & sync button and the Jobs page readiness follow masterCV', async ({ page, request }) => {
    await signUpAndSignIn(page, request, 'Jobs Sync');
    await openStudio(page);
    // Step 1: Jobs starts red
    await page.goto('/jobs');
    await expect(page.getByTestId('profile-status')).toHaveAttribute('data-tone', 'bad');

    // Step 2: load a demo and save from the dashboard readiness card
    await openStudio(page);
    await page.getByTestId('demo-support').click();
    await expect(page.getByTestId('cv-scan')).toHaveClass(/is-done/, { timeout: 10_000 });
    await page.getByTestId('dash-save').click();
    await expect(page.getByTestId('readiness-card')).toContainText('In sync with your profile and Jobs');

    // Step 3: upload a CV file → readiness is green in the studio
    await page.getByTestId('cv-file-input').setInputFiles({ name: 'support-cv.txt', mimeType: 'text/plain', buffer: textCv() });
    await expect(page.getByTestId('cv-scan')).toHaveClass(/is-done/, { timeout: 15_000 });
    await expect(page.getByTestId('status-ready')).toHaveClass(/st-badge--good/);

    // Step 4: Jobs page reads the same profile → green
    await page.getByRole('button', { name: /Back to Huddle/ }).click();
    await page.goto('/jobs');
    await expect(page.getByTestId('profile-status')).toHaveAttribute('data-tone', 'ok');
  });
});

test.describe('Resume studio: CV Generator', () => {
  test('templates, sections, samples, PDF and CSV downloads', async ({ page, request }) => {
    await signUpAndSignIn(page, request, 'Generator');
    page.on('dialog', (d) => d.accept());
    await openStudio(page, '/career/cv');

    // Step 1: load a sample persona from the toolbar
    await page.getByLabel('Load a sample persona').selectOption('support');
    await expect(page.getByLabel('Full name')).toHaveValue('Priya Sharma');
    await expect(page.locator('.cp-noprint[role=status]').first()).toContainText('Sample loaded');

    // Step 2: switch templates — the preview changes layout
    await page.locator('.cp-tpl', { hasText: 'ATS & Ivy League' }).click();
    await expect(page.locator('.cp-tpl', { hasText: 'ATS & Ivy League' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.cp-preview-wrap .cv-paper')).toHaveClass(/cv-ats/);

    // Step 3: add a role, fill it, see it in the preview, then remove it
    const exp = page.locator('.aa-card', { has: page.getByRole('heading', { name: 'Experience' }) });
    await exp.getByRole('button', { name: 'Add' }).click();
    const roles = exp.locator('.cp-entry');
    const last = roles.last();
    await last.getByLabel('Role').fill('Team Lead');
    await last.getByLabel('Company').fill('Acme Support');
    await expect(page.locator('.cp-preview-wrap .cv-paper')).toContainText('Acme Support');
    const n = await roles.count();
    await last.getByRole('button', { name: 'Remove' }).click();
    await expect(roles).toHaveCount(n - 1);

    // Step 4: add education
    const edu = page.locator('.aa-card', { has: page.getByRole('heading', { name: 'Education' }) });
    await edu.getByRole('button', { name: 'Add' }).click();
    await edu.locator('.cp-entry').last().getByLabel('Degree').fill('Diploma in Customer Relations');
    await expect(page.locator('.cp-preview-wrap .cv-paper')).toContainText('Diploma in Customer Relations');

    // Step 5: CSV download — one row per item, phone kept as text
    const [csv] = await Promise.all([page.waitForEvent('download'), page.getByTestId('cv-download-csv').click()]);
    expect(csv.suggestedFilename()).toBe('Priya-Sharma-CV.csv');
    const text = fs.readFileSync(await csv.path(), 'utf8');
    expect(text.split('\r\n')[0]).toBe('﻿Section,Title,Organisation,Start,End,Details');
    expect(text).toContain('Contact,Phone,,,,+91 90040 77889');
    expect(text).toContain('Experience,Senior Customer Support Executive,Teleperformance');
    expect(text).toContain('Education,Diploma in Customer Relations');
    expect(text).toMatch(/Skill,Customer Service/);

    // Step 6: PDF download — a real PDF file
    const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), page.getByTestId('cv-download-pdf').click()]);
    expect(pdf.suggestedFilename()).toBe('Priya-Sharma-CV.pdf');
    const bytes = fs.readFileSync(await pdf.path());
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(10_000);
  });
});

test.describe('Resume studio: experts', () => {
  test('30-minute timeline, booking with the synced CV, and removing a request', async ({ page, request }) => {
    await signUpAndSignIn(page, request, 'Expert Booking');
    await openStudio(page);
    await page.getByTestId('demo-java').click();
    await expect(page.getByTestId('cv-scan')).toHaveClass(/is-done/, { timeout: 10_000 });
    await studioNav(page, 'Expert CV Review');

    // Step 1: horizontal 4-step timeline with the 30-minute split
    const steps = page.locator('.cp-flow-step');
    await expect(steps).toHaveCount(4);
    for (const [i, time] of ['00–05 min', '05–20 min', '20–27 min', '27–30 min'].entries()) await expect(steps.nth(i)).toContainText(time);
    // Step 2: switching session type changes the agenda
    await page.getByRole('button', { name: '1:1 Expert CV Review' }).click();
    await expect(steps.nth(1)).toContainText('Line-by-line feedback');

    // Step 3: open the booking modal — the synced CV is pre-attached
    await page.getByRole('button', { name: /Book 30-Min Session/ }).click();
    const modal = page.getByRole('dialog', { name: 'Book a 30-minute session' });
    await expect(modal).toBeVisible();
    await expect(page.getByTestId('booking-cv')).toContainText('Sample · Java Backend Developer');
    await expect(page.getByTestId('booking-cv').locator('input[type=checkbox]')).toBeChecked();

    // Step 4: pick a date and slot, add goals, submit
    await modal.locator('.cp-date-option').nth(1).click();
    await expect(modal.locator('.cp-date-option').nth(1)).toHaveAttribute('aria-pressed', 'true');
    await modal.locator('.cp-slot-option', { hasText: '10:00 AM' }).click();
    await expect(modal).toContainText('10:00 AM – 10:30 AM');
    await modal.getByPlaceholder('What would you like to work on with this expert?').fill('Backend lead roles');
    await modal.getByRole('button', { name: /Request session/ }).click();
    await expect(modal).toBeHidden();

    // Step 5: the request is listed, with the CV attached
    await expect(page.locator('.cp-booking-notice')).toContainText('Demo only');
    const item = page.locator('.cp-session-item');
    await expect(item).toHaveCount(1);
    await expect(item).toContainText('10:00 AM – 10:30 AM');
    await expect(item).toContainText('Focus: Backend lead roles');
    await expect(item).toContainText('CV attached');

    // Step 6: the booked slot is unavailable for the same expert and date
    await page.getByRole('button', { name: /Book 30-Min Session/ }).click();
    await modal.locator('.cp-date-option').nth(1).click();
    await expect(modal.locator('.cp-slot-option', { hasText: '10:00 AM' })).toBeDisabled();
    await page.locator('.cp-modal-close').click();

    // Step 7: remove the request
    await item.getByRole('button', { name: 'Remove' }).click();
    await expect(item).toHaveCount(0);
    await expect(page.locator('.cp-booking-notice')).toContainText('Demo request removed');
  });

  test('directory search and multi-category filters', async ({ page, request }) => {
    await signUpAndSignIn(page, request, 'Directory');
    await openStudio(page, '/career/experts');
    const results = page.locator('.cp-directory-results strong');
    const cards = page.locator('.cp-directory-expert');

    // Step 1: all experts
    await expect(results).toHaveText('13 experts');
    await expect(cards).toHaveCount(13);
    await expect(page.locator('.cp-cat-chip', { hasText: 'All specialties' })).toHaveAttribute('aria-pressed', 'true');
    // Step 2: one category
    await page.locator('.cp-cat-chip', { hasText: 'Culinary & Hospitality' }).click();
    await expect(results).toHaveText('2 experts');
    // Step 3: a second category adds to it
    await page.locator('.cp-cat-chip', { hasText: 'Finance & Business' }).click();
    await expect(results).toHaveText('4 experts');
    await expect(page.locator('.cp-cat-chip', { hasText: 'All specialties' })).toHaveAttribute('aria-pressed', 'false');
    // Step 4: toggling one off removes it
    await page.locator('.cp-cat-chip', { hasText: 'Culinary & Hospitality' }).click();
    await expect(results).toHaveText('2 experts');
    // Step 5: search narrows within the selection; no match shows the empty state
    await page.getByLabel('Search experts').fill('Neha');
    await expect(results).toHaveText('1 experts');
    await page.getByLabel('Search experts').fill('zzz');
    await expect(page.locator('.cp-directory-empty')).toBeVisible();
    // Step 6: All specialties resets the categories
    await page.getByLabel('Search experts').fill('');
    await page.locator('.cp-cat-chip', { hasText: 'All specialties' }).click();
    await expect(results).toHaveText('13 experts');
    // Step 7: Book slot opens the modal for that expert
    await cards.first().getByRole('button', { name: 'Book slot' }).click();
    await expect(page.getByRole('dialog', { name: 'Book a 30-minute session' })).toBeVisible();
  });
});

test.describe('Resume studio: navigation & layout', () => {
  test('deep links, the removed JD page, Back to Huddle', async ({ page, request }) => {
    await signUpAndSignIn(page, request, 'Navigation');
    // Step 1: every section deep-links
    for (const [path, title] of [['/career/cv', 'CV Generator'], ['/career/role', 'AI CV Builder'], ['/career/expert', 'Expert CV Review'], ['/career/experts', 'Experts Directory'], ['/career/sync', 'My Profile & Sync']]) {
      await openStudio(page, path);
      await expect(page.locator('.aa-topbar__title')).toHaveText(title);
      await expect(page.locator('.aa-nav__item.is-on')).toHaveText(title);
    }
    // Step 2: the removed JD Match page falls back to the dashboard
    await openStudio(page, '/career/jd');
    await expect(page).toHaveURL(/\/career$/);
    await expect(page.locator('.aa-topbar__title')).toHaveText('Career Dashboard');
    await expect(page.locator('.aa-nav__item', { hasText: 'JD Match' })).toHaveCount(0);
    // Step 3: the browser Back button moves between sections
    await studioNav(page, 'CV Generator');
    await studioNav(page, 'Experts Directory');
    await page.goBack();
    await expect(page.locator('.aa-topbar__title')).toHaveText('CV Generator');
    // Step 4: Back to Huddle leaves the studio
    await page.getByRole('button', { name: /Back to Huddle/ }).click();
    await expect(page.getByTestId('rail-feed')).toBeVisible();
  });

  test('mobile: no horizontal scroll, hamburger menu opens and navigates', async ({ page, request }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signUpAndSignIn(page, request, 'Mobile');
    await openStudio(page);
    // Step 1: no sideways scrolling on the dashboard
    expect(await page.evaluate(() => document.querySelector('.admin-app').scrollWidth <= window.innerWidth)).toBe(true);
    // Step 2: open the menu
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(page.locator('.aa-side')).toHaveClass(/is-open/);
    // Step 3: navigate closes it
    await studioNav(page, 'My Profile & Sync');
    await expect(page.locator('.aa-side')).not.toHaveClass(/is-open/);
    await expect(page.locator('.aa-topbar__title')).toHaveText('My Profile & Sync');
    expect(await page.evaluate(() => document.querySelector('.admin-app').scrollWidth <= window.innerWidth)).toBe(true);
  });
});
