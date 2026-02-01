import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('File Upload', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('uploads EPUB file via file input', async ({ page }) => {
    const filePath = path.join(process.cwd(), 'samples', 'alice.epub');

    // Get the file input
    const fileInput = page.locator('#fileInput');

    // Upload the file
    await fileInput.setInputFiles(filePath);

    // Wait for reader to load
    await expect(page.locator('#status')).toContainText(/Page|Document loaded/, { timeout: 15000 });
    await expect(page.locator('#readerContainer')).toBeVisible();
  });

  test('uploads PDF file via file input', async ({ page }) => {
    const filePath = path.join(process.cwd(), 'samples', 'sample.pdf');

    const fileInput = page.locator('#fileInput');
    await fileInput.setInputFiles(filePath);

    await expect(page.locator('#status')).toContainText(/Page|Document loaded/, { timeout: 15000 });
    await expect(page.locator('#readerContainer')).toBeVisible();
  });

  test('uploads CBZ file via file input', async ({ page }) => {
    const filePath = path.join(process.cwd(), 'samples', 'sample.cbz');

    const fileInput = page.locator('#fileInput');
    await fileInput.setInputFiles(filePath);

    await expect(page.locator('#status')).toContainText(/Page|Document loaded/, { timeout: 15000 });
    await expect(page.locator('#readerContainer')).toBeVisible();
  });

  test('dropzone is clickable', async ({ page }) => {
    const dropzone = page.locator('#dropzone');
    await expect(dropzone).toBeVisible();
    // Clicking dropzone should trigger file input (we can't fully test the native file dialog)
    await expect(dropzone).toBeEnabled();
  });
});
