// AI CV Builder (/career/role) and the admin "AI CV Prompt" editor, step by step.
// The Gemini call is mocked at the network layer (page.route), so these run the
// same with or without a GEMINI_API_KEY and never cost tokens.

const { test, expect } = require('@playwright/test');
const { signUpAndSignIn, signInAsAdmin, openStudio, studioNav, statusAts, savedProfile } = require('./career-helpers');

test.use({ launchOptions: { slowMo: 0 } });
test.describe.configure({ timeout: 90_000 });

/** Mock the AI: status = configured, and each POST answers with the next scripted turn. */
async function mockAi(page, turns) {
  const calls = [];
  await page.route('**/api/career/cv-chat/status', (r) => r.fulfill({ json: { configured: true } }));
  await page.route('**/api/career/cv-chat', async (route) => {
    const body = route.request().postDataJSON();
    calls.push(body);
    const next = turns.shift();
    if (!next) return route.fulfill({ status: 502, json: { error: 'No more scripted turns.' } });
    if (next.status) return route.fulfill({ status: next.status, json: { error: next.error } });
    if (next.delayMs) await new Promise((r) => setTimeout(r, next.delayMs));
    return route.fulfill({ json: next });
  });
  return calls;
}

const CV_AFTER_ROLE = {
  name: '', title: 'Customer Support Executive', email: '', phone: '', location: '', summary: '',
  skills: ['Customer Service'], experience: [], education: [],
};
const CV_DRAFT = {
  name: 'AI Member', title: 'Customer Support Executive', email: 'ai@example.com', phone: '+91 90000 11111', location: 'Pune',
  summary: 'Customer support executive with 2 years at Teleperformance handling telecom customers with empathy and high CSAT.',
  skills: ['Customer Service', 'CSAT', 'First Call Resolution', 'Zendesk', 'Active Listening', 'Hindi', 'English'],
  experience: [{ title: 'Customer Support Executive', company: 'Teleperformance', start: '2023', end: 'Present', description: '• Handled [X+ calls/day] for a telecom client\n• Resolved escalations with empathy, keeping [95%+ CSAT]' }],
  education: [{ degree: 'B.Com', school: 'Pune University', year: '2022' }],
};

test.describe('AI CV Builder', () => {
  test('not configured: shows the set-up message instead of the chat', async ({ page, request }) => {
    await signUpAndSignIn(page, request, 'AI Off');
    await page.route('**/api/career/cv-chat/status', (r) => r.fulfill({ json: { configured: false } }));
    await openStudio(page, '/career/role');
    await expect(page.getByText('The AI CV builder isn’t set up on this server yet.')).toBeVisible();
    await expect(page.getByTestId('cv-chat')).toHaveCount(0);
  });

  test('full chat: greeting → chips → typing → CV builds live in masterCV → errors → retry → save', async ({ page, request }) => {
    const { token } = await signUpAndSignIn(page, request, 'AI Chat');
    const calls = await mockAi(page, [
      { delayMs: 600, reply: 'Great choice! What was your most recent job, and where?', progress: 30, suggestions: ['2 years at a BPO', 'Fresher', 'Retail customer care', 'Hotel front desk'], cv: CV_AFTER_ROLE },
      { status: 502, error: 'The AI assistant is unavailable right now. Please try again in a moment.' },
      { reply: 'Here is your first full draft!\n• Missing keywords: AHT, CRM, Ticketing\nWhat is your phone number?', progress: 80, suggestions: ['Add phone number', 'Add certifications', 'Looks great'], cv: CV_DRAFT },
    ]);
    await openStudio(page, '/career/role');

    // Step 1: greeting from the Co-Pilot + 6 profession chips
    const chat = page.getByTestId('cv-chat');
    await expect(chat).toBeVisible();
    await expect(page.getByTestId('chat-assistant').first()).toContainText('AI CV Co-Pilot');
    await expect(page.getByTestId('chat-assistant').first()).toContainText('what job are you looking for?');
    const chips = chat.locator('.cp-chip');
    await expect(chips).toHaveCount(6);
    await expect(chips.first()).toHaveText('Customer support / BPO');
    await expect(page.getByTestId('chat-send')).toBeDisabled(); // empty input

    // Step 2: tapping a chip sends it; typing indicator shows while waiting
    await chips.first().click();
    await expect(page.getByTestId('chat-user').last()).toHaveText('Customer support / BPO');
    await expect(chat.locator('.cp-msg--typing')).toBeVisible();
    await expect(page.getByTestId('chat-input')).toBeDisabled();
    await expect(page.getByTestId('chat-assistant').last()).toContainText('most recent job');
    await expect(chat.locator('.cp-msg--typing')).toHaveCount(0);
    // the request carried the transcript and the current masterCV
    expect(calls[0].messages.at(-1)).toEqual({ role: 'user', text: 'Customer support / BPO' });
    expect(calls[0].messages[0].role).toBe('assistant');
    expect(calls[0].cv).toHaveProperty('skills');

    // Step 3: new chips + progress + the CV preview updated
    await expect(chips).toHaveCount(4);
    await expect(chat.locator('.cp-chip', { hasText: '2 years at a BPO' })).toBeVisible();
    await expect(page.locator('.cp-chat-cv')).toContainText('30% complete');
    await expect(page.getByTestId('chat-preview').locator('.cv-title')).toHaveText('Customer Support Executive');

    // Step 4: the AI reply went straight into masterCV (status bar = unsaved, ATS agrees)
    await expect(page.locator('.st-dot')).toHaveText('Unsaved');
    await expect(page.getByTestId('chat-ats')).toHaveText(String(await statusAts(page)));

    // Step 5: an AI error restores the message and offers Retry
    const answer = '2 years at Teleperformance in Pune since 2023, B.Com 2022, good communication and patience';
    await page.getByTestId('chat-input').fill(answer);
    await page.getByTestId('chat-input').press('Enter');
    const alert = chat.getByRole('alert');
    await expect(alert).toContainText('unavailable right now');
    await expect(page.getByTestId('chat-input')).toHaveValue(answer);
    await expect(page.getByTestId('chat-user')).toHaveCount(1); // the failed turn was rolled back

    // Step 6: Retry succeeds → the first full draft (Next-Level Suggestions in the reply)
    await alert.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByTestId('chat-assistant').last()).toContainText('Missing keywords: AHT, CRM, Ticketing');
    await expect(page.getByTestId('chat-input')).toHaveValue('');
    await expect(page.locator('.cp-chat-cv')).toContainText('80% complete');
    await expect(page.getByTestId('chat-preview')).toContainText('Teleperformance');
    await expect(page.getByTestId('chat-preview')).toContainText('B.Com');

    // Step 7: placeholders like [X+ calls/day] are flagged before download
    await expect(page.getByTestId('chat-placeholders')).toContainText('Replace 2 placeholders');
    await expect(page.getByTestId('chat-placeholders')).toContainText('[X+ calls/day]');

    // Step 8: Shift+Enter adds a new line instead of sending
    await page.getByTestId('chat-input').fill('line one');
    await page.getByTestId('chat-input').press('Shift+Enter');
    await expect(page.getByTestId('chat-input')).toHaveValue('line one\n');
    await page.getByTestId('chat-input').fill('');

    // Step 9: the conversation survives leaving and coming back
    await studioNav(page, 'Dashboard');
    await expect(page.getByTestId('readiness-card')).toContainText('Customer Support Executive');
    await studioNav(page, 'AI CV Builder');
    await expect(page.getByTestId('chat-user')).toHaveCount(2);

    // Step 10: Edit opens the Generator with the same CV
    await page.getByTestId('chat-open-generator').click();
    await expect(page).toHaveURL(/\/career\/cv$/);
    await expect(page.getByLabel('Full name')).toHaveValue('AI Member');
    await studioNav(page, 'AI CV Builder');

    // Step 11: Save to my profile → server profile updated, studio in sync
    await page.getByTestId('chat-save-profile').click();
    await expect(page.locator('.cp-chat-cv .aa-msg--ok')).toContainText('Saved to your profile');
    await expect(page.locator('.st-dot')).toHaveCount(0);
    const saved = await savedProfile(request, token);
    expect(saved.headline).toBe('Customer Support Executive');
    expect(saved.skills).toEqual(expect.arrayContaining(['Zendesk', 'CSAT']));
    expect(saved.experience[0].company).toBe('Teleperformance');

    // Step 12: Start over resets the conversation (but not the CV)
    await chat.getByRole('button', { name: 'Start over' }).click();
    await expect(page.getByTestId('chat-user')).toHaveCount(0);
    await expect(page.getByTestId('chat-assistant')).toHaveCount(1);
    await expect(page.getByTestId('chat-assistant').first()).toContainText('Customer Support Executive');
    await expect(page.getByTestId('chat-preview')).toContainText('Teleperformance');
  });
});

test.describe('Admin: AI CV Prompt editor', () => {
  test('members are refused; admins view, edit, save, discard, load default and reset', async ({ page, request }) => {
    // Step 1: a member can't read or change the prompt (API)
    const member = await (await request.post('/api/auth/register', { data: { name: 'Prompt Member', email: `pm-${Date.now()}@example.com`, password: 'test-pass-1234' } })).json();
    expect((await request.get('/api/admin/ai/cv-prompt', { headers: { Authorization: `Bearer ${member.token}` } })).status()).toBe(403);
    expect((await request.put('/api/admin/ai/cv-prompt', { headers: { Authorization: `Bearer ${member.token}` }, data: { prompt: 'x'.repeat(80) } })).status()).toBe(403);

    // Step 2: admin opens Admin → AI CV Prompt
    page.on('dialog', (d) => d.accept());
    await signInAsAdmin(page);
    await page.goto('/admin');
    await page.locator('.aa-nav__item', { hasText: 'AI CV Prompt' }).click();
    const editor = page.getByTestId('ai-prompt-text');
    await expect(editor).toBeVisible();
    await expect(page.locator('.aa-topbar__title')).toHaveText('AI CV Prompt');

    // Step 3: the default master prompt is loaded
    await expect(page.getByTestId('ai-prompt-page')).toContainText('Using the built-in default');
    await expect(editor).toHaveValue(/Huddle AI CV Co-Pilot/);
    await expect(page.getByTestId('ai-prompt-save')).toBeDisabled(); // nothing changed
    await expect(page.locator('.aa-prompt__meta')).toContainText('/ 12,000 characters');

    // Step 4: the fixed rules are shown read-only on demand
    await page.getByRole('button', { name: /Show the fixed rules/ }).click();
    await expect(page.getByTestId('ai-prompt-fixed')).toContainText('NEVER invent facts');
    await page.getByRole('button', { name: /Hide the fixed rules/ }).click();
    await expect(page.getByTestId('ai-prompt-fixed')).toHaveCount(0);

    // Step 5: edit → unsaved marker → Discard restores
    const original = await editor.inputValue();
    await editor.fill(`${original}\n- Temporary line.`);
    await expect(page.locator('.aa-prompt__meta')).toContainText('Unsaved changes');
    await page.getByRole('button', { name: 'Discard changes' }).click();
    await expect(editor).toHaveValue(original);

    // Step 6: a too-short prompt can't be saved
    await editor.fill('Too short');
    await expect(page.getByTestId('ai-prompt-save')).toBeDisabled();

    // Step 7: save a custom prompt
    const custom = `${original}\n- Always greet members by their first name.`;
    await editor.fill(custom);
    await page.getByTestId('ai-prompt-save').click();
    await expect(page.locator('.aa-msg--ok')).toContainText('Saved');
    await expect(page.getByTestId('ai-prompt-page')).toContainText('Custom · edited');
    await expect(page.getByTestId('ai-prompt-page')).toContainText('by E2E Admin');

    // Step 8: it persisted on the server
    await page.reload();
    await page.locator('.aa-nav__item', { hasText: 'AI CV Prompt' }).click();
    await expect(editor).toHaveValue(/greet members by their first name\.$/);

    // Step 9: the change is in the audit log
    await page.locator('.aa-nav__item', { hasText: 'Activity Logs' }).click();
    await expect(page.locator('.aa-logstream')).toContainText('updated the AI CV builder prompt');

    // Step 10: Load default fills the editor (not saved until Save)
    await page.locator('.aa-nav__item', { hasText: 'AI CV Prompt' }).click();
    await page.getByRole('button', { name: 'Load default' }).click();
    await expect(editor).toHaveValue(original);
    await expect(page.getByTestId('ai-prompt-page')).toContainText('Custom · edited');

    // Step 11: Reset to default removes the custom prompt
    await page.getByRole('button', { name: 'Reset to default' }).click();
    await expect(page.locator('.aa-msg--ok')).toContainText('Reset to the default prompt');
    await expect(page.getByTestId('ai-prompt-page')).toContainText('Using the built-in default');
    await expect(page.getByRole('button', { name: 'Reset to default' })).toHaveCount(0);
  });
});
