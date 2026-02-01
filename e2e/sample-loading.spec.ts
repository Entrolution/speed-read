import { test, expect } from '@playwright/test';

test.describe('Sample File Loading', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('loads EPUB sample successfully', async ({ page }) => {
    // Click the EPUB sample button
    await page.click('#btn-epub');

    // Wait for reader to be ready (either "Page" or "Document loaded")
    await expect(page.locator('#status')).toContainText(/Page|Document loaded/, { timeout: 15000 });

    // Verify reader container is visible
    await expect(page.locator('#readerContainer')).toBeVisible();
  });

  test('loads PDF sample successfully', async ({ page }) => {
    await page.click('#btn-pdf');

    await expect(page.locator('#status')).toContainText(/Page|Document loaded/, { timeout: 15000 });
    await expect(page.locator('#readerContainer')).toBeVisible();
  });

  test('loads CBZ sample successfully', async ({ page }) => {
    await page.click('#btn-cbz');

    await expect(page.locator('#status')).toContainText(/Page|Document loaded/, { timeout: 15000 });
    await expect(page.locator('#readerContainer')).toBeVisible();
  });

  test('shows error for failed load', async ({ page }) => {
    // Intercept and fail the request
    await page.route('**/samples/alice.epub*', (route) => route.abort());

    await page.click('#btn-epub');

    await expect(page.locator('#status')).toContainText('Failed', { timeout: 10000 });
  });
});
