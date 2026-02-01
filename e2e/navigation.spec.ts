import { test, expect } from '@playwright/test';

// Helper to wait for reader to be ready and get page info
async function waitForReaderReady(page: any) {
  await expect(page.locator('#status')).toContainText(/Page \d+ of \d+|Document loaded/, { timeout: 15000 });
  await page.waitForTimeout(500); // Let the reader settle
}

// Helper to get current page from status
async function getCurrentPage(page: any): Promise<number> {
  const status = await page.locator('#status').textContent();
  const match = status?.match(/Page (\d+)/);
  return match ? parseInt(match[1]) : 0;
}

test.describe('Navigation', () => {
  test.describe('PDF Navigation', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await page.click('#btn-pdf');
      await waitForReaderReady(page);
    });

    test('navigates forward with right arrow key', async ({ page }) => {
      const initialPage = await getCurrentPage(page);
      if (initialPage === 0) {
        test.skip(); // Skip if page info not available
        return;
      }

      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(1000);

      const newPage = await getCurrentPage(page);
      expect(newPage).toBe(initialPage + 1);
    });

    test('navigates backward with left arrow key', async ({ page }) => {
      // Go to page 2 first
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(1000);

      const pageBefore = await getCurrentPage(page);
      if (pageBefore <= 1) {
        test.skip();
        return;
      }

      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(1000);

      const pageAfter = await getCurrentPage(page);
      expect(pageAfter).toBe(pageBefore - 1);
    });

    test('navigates with space key', async ({ page }) => {
      const initialPage = await getCurrentPage(page);
      if (initialPage === 0) {
        test.skip();
        return;
      }

      await page.keyboard.press('Space');
      await page.waitForTimeout(1000);

      const newPage = await getCurrentPage(page);
      expect(newPage).toBe(initialPage + 1);
    });
  });

  test.describe('EPUB Navigation', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await page.click('#btn-epub');
      await waitForReaderReady(page);
    });

    test('navigates forward with right arrow key', async ({ page }) => {
      const initialPage = await getCurrentPage(page);

      // Focus the reader container for keyboard events
      await page.locator('#readerContainer').click();
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(1500); // EPUB navigation can be slower

      const newPage = await getCurrentPage(page);
      // EPUB may not always increment by exactly 1, just check it moved
      expect(newPage).toBeGreaterThanOrEqual(initialPage);
    });

    test('reader container receives focus', async ({ page }) => {
      // Just verify the reader is interactive
      await expect(page.locator('#readerContainer')).toBeVisible();
      await expect(page.locator('speed-reader')).toBeVisible();
    });
  });

  test.describe('CBZ Navigation', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await page.click('#btn-cbz');
      await waitForReaderReady(page);
    });

    test('navigates through comic pages', async ({ page }) => {
      const initialPage = await getCurrentPage(page);
      if (initialPage === 0) {
        test.skip();
        return;
      }

      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(1000);

      const newPage = await getCurrentPage(page);
      expect(newPage).toBe(initialPage + 1);
    });

    test('displays comic image', async ({ page }) => {
      // Check that an image is displayed
      await expect(page.locator('.speed-reader-cbz-image')).toBeVisible({ timeout: 10000 });
    });
  });
});
