import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Visual Regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test.describe('Document Rendering', () => {
    test('renders PDF correctly', async ({ page }) => {
      const filePath = path.join(process.cwd(), 'samples', 'sample.pdf');
      const fileInput = page.locator('#fileInput');
      await fileInput.setInputFiles(filePath);

      // Wait for document to load
      await expect(page.locator('#status')).toContainText(/Page|Document loaded/, { timeout: 15000 });

      // Wait for render to stabilize
      await page.waitForTimeout(500);

      const reader = page.locator('speed-reader');
      await expect(reader).toHaveScreenshot('pdf-loaded.png', {
        animations: 'disabled',
        timeout: 10000,
      });
    });

    test('renders EPUB correctly', async ({ page }) => {
      const filePath = path.join(process.cwd(), 'samples', 'alice.epub');
      const fileInput = page.locator('#fileInput');
      await fileInput.setInputFiles(filePath);

      // Wait for document to load
      await expect(page.locator('#status')).toContainText(/Page|Document loaded/, { timeout: 15000 });

      // Wait for render to stabilize
      await page.waitForTimeout(500);

      const reader = page.locator('speed-reader');
      await expect(reader).toHaveScreenshot('epub-loaded.png', {
        animations: 'disabled',
        timeout: 10000,
      });
    });

    test('renders CBZ correctly', async ({ page }) => {
      const filePath = path.join(process.cwd(), 'samples', 'sample.cbz');
      const fileInput = page.locator('#fileInput');
      await fileInput.setInputFiles(filePath);

      // Wait for document to load
      await expect(page.locator('#status')).toContainText(/Page|Document loaded/, { timeout: 15000 });

      // Wait for image to render
      await page.waitForTimeout(500);

      const reader = page.locator('speed-reader');
      await expect(reader).toHaveScreenshot('cbz-loaded.png', {
        animations: 'disabled',
        timeout: 10000,
      });
    });
  });

  test.describe('Navigation Controls', () => {
    test('shows navigation buttons', async ({ page }) => {
      const filePath = path.join(process.cwd(), 'samples', 'sample.pdf');
      const fileInput = page.locator('#fileInput');
      await fileInput.setInputFiles(filePath);

      // Wait for document to load
      await expect(page.locator('#status')).toContainText(/Page|Document loaded/, { timeout: 15000 });

      // Screenshot just the controls area
      const controls = page.locator('speed-reader').locator('nav').first();
      await expect(controls).toHaveScreenshot('navigation-controls.png', {
        animations: 'disabled',
        timeout: 10000,
      });
    });
  });

  test.describe('Error States', () => {
    test('shows error for unsupported format', async ({ page }) => {
      const fileInput = page.locator('#fileInput');

      // Create a fake unsupported file
      const buffer = Buffer.from('This is not a valid document');
      await fileInput.setInputFiles({
        name: 'test.xyz',
        mimeType: 'application/octet-stream',
        buffer,
      });

      // Wait for error state to appear
      await expect(page.locator('#status')).toContainText(/Error|Unsupported|Invalid/, { timeout: 10000 });

      const reader = page.locator('speed-reader');
      await expect(reader).toHaveScreenshot('error-unsupported-format.png', {
        animations: 'disabled',
        timeout: 10000,
      });
    });
  });
});
