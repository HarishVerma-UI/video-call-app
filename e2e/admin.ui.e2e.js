// Browser-level end-to-end tests for admin dashboard workflows.

const { test, expect } = require('@playwright/test');

const ADMIN = {
  email: 'admin@example.test',
  password: 'admin-test-1234',
};

async function signInAsAdmin(page) {
  await page.goto('/');
  await page.getByLabel(/email/i).fill(ADMIN.email);
  await page.getByLabel(/password/i).fill(ADMIN.password);
  await page.getByTestId('password-submit').click();
  await expect(page.getByTestId('rail-admin')).toBeVisible();
}

test.describe('UI: Admin dashboard', () => {
  test('admin creates, updates, and deletes a user', async ({ page }) => {
    test.setTimeout(120_000);
    const user = {
      name: `Managed User ${Date.now()}`,
      updatedName: `Updated User ${Date.now()}`,
      email: `managed-${Date.now()}@example.test`,
      password: 'managed-user-1234',
    };

    await signInAsAdmin(page);
    await page.getByTestId('rail-admin').click();
    await expect(page.getByRole('heading', { name: 'Platform Administration & Intelligence' })).toBeVisible();
    for (const [label, hash] of [
      ['Overview', 'overview'],
      ['Users', 'users'],
      ['Recruiters', 'recruiters'],
      ['Jobs', 'jobs'],
      ['Activity', 'audit'],
      ['Ads', 'ads'],
    ]) {
      await page.getByRole('link', { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`#${hash}$`));
    }
    await expect(page.getByRole('columnheader', { name: 'Expected salary' })).toBeVisible();
    const jobsHeading = page.getByRole('heading', { name: 'Jobs Manager' });
    await jobsHeading.scrollIntoViewIfNeeded();
    await expect(jobsHeading).toBeVisible();
    await expect.poll(() => page.locator('.admin-dash').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await expect(page).toHaveURL(/\/admin(?:#.*)?$/);

    await page.getByTestId('add-user').click();
    await expect(page.getByRole('dialog', { name: 'Add user' })).toBeVisible();
    await page.getByLabel('Name', { exact: true }).fill(user.name);
    await page.getByLabel('Email', { exact: true }).fill(user.email);
    await page.getByLabel('Password', { exact: true }).fill(user.password);
    await page.getByTestId('user-role').selectOption('member');
    await page.getByTestId('save-user').click();

    const row = page.getByTestId('user-table').locator('.admin-dir__row').filter({ hasText: user.email });
    await expect(row).toContainText(user.name);
    await expect(row).toContainText('Member');

    await row.getByRole('button', { name: 'Actions' }).click();
    await row.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Name', { exact: true }).fill(user.updatedName);
    await page.getByTestId('user-role').selectOption('recruiter');
    await page.getByTestId('save-user').click();

    await expect(row).toContainText(user.updatedName);
    await expect(row).toContainText('Recruiter');

    page.once('dialog', (dialog) => dialog.accept());
    await row.getByRole('button', { name: 'Actions' }).click();
    await row.getByRole('button', { name: 'Delete' }).click();
    await expect(row).toHaveCount(0);
  });

  test('admin cannot remove their own admin role or delete their own account', async ({ page }) => {
    test.setTimeout(90_000);
    await signInAsAdmin(page);
    await page.getByTestId('rail-admin').click();
    await expect(page.getByRole('link', { name: 'User Directory' })).toHaveCount(0);

    const selfRow = page.getByTestId('user-table').locator('.admin-dir__row').filter({ hasText: ADMIN.email });
    await selfRow.scrollIntoViewIfNeeded();
    await expect(selfRow).toContainText('E2E Admin');
    await selfRow.getByRole('button', { name: 'Actions' }).click();
    await selfRow.getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByTestId('user-role')).toBeDisabled();
    await page.getByRole('button', { name: 'Cancel' }).click();

    await selfRow.getByRole('button', { name: 'Actions' }).click();
    await expect(selfRow.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });
});
