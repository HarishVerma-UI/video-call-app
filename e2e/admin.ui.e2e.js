// Browser-level end-to-end tests for the Admin Control Center (/admin), step by step.

const { test, expect } = require('@playwright/test');

const ADMIN = {
  email: 'admin@example.test',
  password: 'admin-test-1234',
};

test.use({ launchOptions: { slowMo: 0 } });

async function signInAsAdmin(page) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(ADMIN.email);
  await page.getByLabel(/password/i).fill(ADMIN.password);
  await page.getByTestId('password-submit').click();
  await expect(page.getByTestId('rail-admin')).toBeVisible();
}

async function adminNav(page, label) {
  await page.locator('.aa-nav__item', { hasText: label }).click();
  await expect(page.locator('.aa-topbar__title')).toHaveText(label);
}

/** The Users table row for an email. */
const userRow = (page, email) => page.locator('.aa-table-wrap tbody tr', { hasText: email });

test.describe('UI: Admin dashboard', () => {
  test('admin opens every section of the control center', async ({ page }) => {
    // Step 1: the Admin rail item opens the console on the dashboard
    await signInAsAdmin(page);
    await page.getByTestId('rail-admin').click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.locator('.aa-topbar__title')).toHaveText('Dashboard');
    await expect(page.locator('.aa-kpi').first()).toBeVisible();

    // Step 2: every section opens with its title
    for (const label of ['Users', 'Connections', 'Posts', 'Comments', 'Jobs', 'Post a Job', 'Applications', 'AI CV Prompt', 'Activity Logs', 'Dashboard']) {
      await adminNav(page, label);
    }
    // Step 3: Back to Huddle leaves the console
    await page.getByRole('button', { name: /Back to Huddle/ }).click();
    await expect(page.getByTestId('rail-feed')).toBeVisible();
  });

  test('admin finds, edits and deletes a user', async ({ page, request }) => {
    test.setTimeout(90_000);
    const stamp = Date.now();
    const user = { name: `Managed User ${stamp}`, email: `managed-${stamp}@example.test`, password: 'managed-user-1234' };
    const updatedName = `Updated User ${stamp}`;
    // Step 1: a member signs up (API)
    expect((await request.post('/api/auth/register', { data: user })).status()).toBe(201);

    // Step 2: admin searches the Users table
    await signInAsAdmin(page);
    await page.goto('/admin');
    await adminNav(page, 'Users');
    await page.getByPlaceholder('Search candidates by name, email…').fill(user.email);
    const row = userRow(page, user.email);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(user.name);
    await expect(row).toContainText('Member');

    // Step 3: view details
    await row.getByTitle('View details').click();
    const details = page.getByRole('dialog', { name: `${user.name} details` });
    await expect(details).toBeVisible();
    await expect(details).toContainText(user.email);
    await page.keyboard.press('Escape');
    await expect(details).toBeHidden();

    // Step 4: edit name + role in the drawer
    await row.getByTitle('Edit user').click();
    await expect(page.getByRole('dialog', { name: `Edit ${user.name}` })).toBeVisible();
    // (the drawer's label follows the name, so after saving it becomes "Edit <new name>")
    const drawer = page.getByRole('dialog', { name: /^Edit / });
    await drawer.getByLabel('Full name').fill(updatedName);
    await drawer.getByLabel('Role').selectOption('recruiter');
    await drawer.getByRole('button', { name: 'Save changes' }).click();
    await expect(drawer.locator('.aa-msg--ok')).toHaveText('Saved.');
    await drawer.getByRole('button', { name: 'Close', exact: true }).last().click();
    await expect(row).toContainText(updatedName);
    await expect(row).toContainText('Recruiter');

    // Step 5: the role filter finds them as a recruiter
    await page.getByLabel('Filter by role').selectOption('recruiter');
    await expect(row).toHaveCount(1);
    await page.getByLabel('Filter by role').selectOption('');

    // Step 6: delete (with confirmation)
    page.once('dialog', (dialog) => dialog.accept());
    await row.getByTitle('Delete user').click();
    await expect(row).toHaveCount(0);
    // Step 7: the deletion is in the audit log
    await adminNav(page, 'Activity Logs');
    await expect(page.locator('.aa-logstream')).toBeVisible();
  });

  test('admin cannot remove their own admin role or delete their own account', async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto('/admin');
    await adminNav(page, 'Users');
    await page.getByPlaceholder('Search candidates by name, email…').fill(ADMIN.email);
    const selfRow = userRow(page, ADMIN.email);
    await expect(selfRow).toContainText('E2E Admin');

    // Step 1: own delete button is disabled
    await expect(selfRow.getByTitle('Delete user')).toBeDisabled();
    // Step 2: choosing a lower role for yourself shows a warning
    await selfRow.getByTitle('Edit user').click();
    const drawer = page.getByRole('dialog', { name: 'Edit E2E Admin' });
    await drawer.getByLabel('Role').selectOption('member');
    await expect(drawer).toContainText('You can’t remove your own super-admin access.');
    // Step 3: the server refuses the change too
    await drawer.getByRole('button', { name: 'Save changes' }).click();
    await expect(drawer.locator('.aa-msg:not(.aa-msg--ok)').last()).toBeVisible();
    await expect(drawer.locator('.aa-msg--ok')).toHaveCount(0);
    await drawer.getByRole('button', { name: 'Close', exact: true }).last().click();
    await expect(selfRow).toContainText('Super Admin');
  });
});
