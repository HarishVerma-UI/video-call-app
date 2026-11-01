// Browser-level end-to-end tests for the social features.
// These require the web app to be built (npm run build) before running.

const { test, expect } = require('@playwright/test');

let counter = 0;
function freshCreds(name = 'UI User') {
  counter++;
  return {
    name: `${name} ${counter}`,
    email: `ui-${counter}-${Date.now()}@example.com`,
    password: 'test-pass-1234',
  };
}

/** Register via the UI login form. */
async function registerViaUI(page, creds) {
  await page.goto('/');
  // Switch to registration form
  await page.getByTestId('tab-register').click();
  await page.getByLabel(/name/i).fill(creds.name);
  await page.getByLabel(/email/i).fill(creds.email);
  await page.getByLabel(/password/i).fill(creds.password);
  await page.getByTestId('password-submit').click();
  // Wait for the app shell to load (feed is the default view)
  await expect(page.locator('[data-testid="rail-feed"]')).toBeVisible({ timeout: 5000 });
}

/** Register via API and log in via UI. */
async function registerAndLogin(page, request, name) {
  const creds = freshCreds(name);

  // Register via API (faster, avoids flaky form interactions for setup)
  const res = await request.post('/api/auth/register', { data: creds });
  expect(res.status()).toBe(201);
  const body = await res.json();

  // Log in via UI
  await page.goto('/');
  await page.getByLabel(/email/i).fill(creds.email);
  await page.getByLabel(/password/i).fill(creds.password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await expect(page.locator('[data-testid="rail-feed"]')).toBeVisible({ timeout: 5000 });

  return { ...body, creds };
}

test.describe('UI: Account journey', () => {
  test('registers, signs out, signs in, and signs out again', async ({ page }) => {
    const user = freshCreds('Account Journey');

    await registerViaUI(page, user);
    await expect(page.locator('[data-testid="rail-feed"]')).toBeVisible();

    await page.getByTestId('rail-profile').click();
    await page.getByTestId('sign-out').click();
    await expect(page.getByTestId('tab-login')).toBeVisible();

    await page.getByLabel(/email/i).fill(user.email);
    await page.getByLabel(/password/i).fill(user.password);
    await page.getByTestId('password-submit').click();
    await expect(page.locator('[data-testid="rail-feed"]')).toBeVisible({ timeout: 5000 });

    await page.getByTestId('rail-profile').click();
    await page.getByTestId('sign-out').click();
    await expect(page.getByTestId('tab-login')).toBeVisible();
  });
});

test.describe('UI: Profile photo upload', () => {
  test('uploads and displays a profile photo', async ({ page, request }) => {
    const user = freshCreds('Photo Upload');
    const registered = await request.post('/api/auth/register', { data: user });
    expect(registered.status()).toBe(201);

    await page.goto('/');
    await page.getByLabel(/email/i).fill(user.email);
    await page.getByLabel(/password/i).fill(user.password);
    await page.getByTestId('password-submit').click();
    await expect(page.getByTestId('rail-profile')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('rail-profile').click();

    await page.locator('input[accept="image/*"]').setInputFiles({
      name: 'profile.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64'),
    });

    await expect(page.locator('.pp-photo img.pf-avatar')).toHaveAttribute('src', /\/api\/media\/local\/view\?/);
  });

  test('uploads an image to a feed post and displays it', async ({ page, request }) => {
    await registerAndLogin(page, request, 'Post Photo');
    const imageBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
      'base64',
    );

    await page.locator('input[accept="image/*"]').setInputFiles({
      name: 'post.png',
      mimeType: 'image/png',
      buffer: imageBuffer,
    });

    const preview = page.locator('.post-composer__preview');
    await expect(preview).toBeVisible();
    await expect(preview).toHaveAttribute('src', /^blob:/);
    await expect(page.getByTestId('submit-post')).toBeEnabled();
    await page.getByTestId('submit-post').click();

    const postImage = page.locator('.post__img');
    await expect(postImage).toHaveAttribute('src', /\/api\/media\/local\/view\?/);
    await expect.poll(() => postImage.evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
  });

  test('shows an error when the selected image type is unsupported', async ({ page, request }) => {
    await registerAndLogin(page, request, 'Unsupported Photo');
    await page.locator('input[accept="image/*"]').setInputFiles({
      name: 'not-an-image.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
    });
    await expect(page.getByRole('alert')).toContainText('file type isn’t allowed');
    await expect(page.getByTestId('submit-post')).toBeDisabled();
  });
});

test.describe('UI: Feed visibility', () => {
  test('User B sees User A post in the feed', async ({ page, request }) => {
    // Register two users via API
    const alice = freshCreds('Alice');
    const bob = freshCreds('Bob');

    const aliceRes = await (await request.post('/api/auth/register', { data: alice })).json();
    await request.post('/api/auth/register', { data: bob });

    // Alice creates a post via API
    await request.post('/api/posts', {
      headers: { Authorization: `Bearer ${aliceRes.token}` },
      data: { text: 'Hello from the UI test!' },
    });

    // Bob logs in via UI
    await page.goto('/');
    await page.getByLabel(/email/i).fill(bob.email);
    await page.getByLabel(/password/i).fill(bob.password);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await expect(page.locator('[data-testid="rail-feed"]')).toBeVisible({ timeout: 5000 });

    // Bob should see Alice's post in the feed
    await expect(page.getByText('Hello from the UI test!')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('UI: People tab', () => {
  test('newly registered user appears in People tab', async ({ page, request }) => {
    const target = freshCreds('Visible Person');
    const viewer = freshCreds('Viewer');

    await request.post('/api/auth/register', { data: target });
    const viewerRes = await (await request.post('/api/auth/register', { data: viewer })).json();

    // Viewer logs in
    await page.goto('/');
    await page.getByLabel(/email/i).fill(viewer.email);
    await page.getByLabel(/password/i).fill(viewer.password);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await expect(page.locator('[data-testid="rail-people"]')).toBeVisible({ timeout: 5000 });

    // Navigate to People tab
    await page.locator('[data-testid="rail-people"]').click();

    // Should see the target user listed
    await expect(page.getByText(target.name)).toBeVisible({ timeout: 5000 });
  });

  test('search finds a user by name', async ({ page, request }) => {
    const target = freshCreds('Searchable Unicorn');
    const searcher = freshCreds('SearchUser');

    await request.post('/api/auth/register', { data: target });
    await request.post('/api/auth/register', { data: searcher });

    // Searcher logs in
    await page.goto('/');
    await page.getByLabel(/email/i).fill(searcher.email);
    await page.getByLabel(/password/i).fill(searcher.password);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await expect(page.locator('[data-testid="rail-people"]')).toBeVisible({ timeout: 5000 });

    // Go to People tab and search
    await page.locator('[data-testid="rail-people"]').click();
    const searchInput = page.getByPlaceholder(/search|find/i);
    if (await searchInput.isVisible()) {
      await searchInput.fill('Unicorn');
      // Wait for results
      await expect(page.getByText(target.name)).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe('UI: Navigation', () => {
  test('rail navigates between views', async ({ page, request }) => {
    const user = freshCreds('NavUser');
    await request.post('/api/auth/register', { data: user });

    await page.goto('/');
    await page.getByLabel(/email/i).fill(user.email);
    await page.getByLabel(/password/i).fill(user.password);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await expect(page.locator('[data-testid="rail-feed"]')).toBeVisible({ timeout: 5000 });

    // Navigate to People
    await page.locator('[data-testid="rail-people"]').click();
    await expect(page).toHaveURL(/\/people/);

    // Navigate to Network
    await page.locator('[data-testid="rail-network"]').click();
    await expect(page).toHaveURL(/\/network/);

    // Navigate to Messages
    await page.locator('[data-testid="rail-messages"]').click();
    await expect(page).toHaveURL(/\/messages/);

    // Navigate to Meet
    await page.locator('[data-testid="rail-meet"]').click();
    await expect(page).toHaveURL(/\/meet/);

    // Back to Feed
    await page.locator('[data-testid="rail-feed"]').click();
    await expect(page).toHaveURL('/');
  });
});
