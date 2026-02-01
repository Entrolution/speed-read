import { describe, it, expect } from 'vitest';
import { checkDRM, checkPdfDRM, checkEpubDRM } from './drm';

describe('drm', () => {
  describe('checkPdfDRM', () => {
    it('should detect encrypted PDF', () => {
      const pdfContent = '%PDF-1.4\n/Encrypt /Standard\ntrailer';
      const bytes = new TextEncoder().encode(pdfContent);
      const result = checkPdfDRM(bytes.buffer);
      expect(result.hasDRM).toBe(true);
      expect(result.type).toBe('Password protected');
    });

    it('should detect Adobe PDF DRM', () => {
      const pdfContent = '%PDF-1.4\n/Encrypt /ADBEPDF\ntrailer';
      const bytes = new TextEncoder().encode(pdfContent);
      const result = checkPdfDRM(bytes.buffer);
      expect(result.hasDRM).toBe(true);
      expect(result.type).toBe('Adobe PDF DRM');
    });

    it('should return false for unencrypted PDF', () => {
      const pdfContent = '%PDF-1.4\n/Pages /Type\ntrailer';
      const bytes = new TextEncoder().encode(pdfContent);
      const result = checkPdfDRM(bytes.buffer);
      expect(result.hasDRM).toBe(false);
    });
  });

  describe('checkEpubDRM', () => {
    it('should detect Adobe ADEPT DRM', () => {
      const epubContent = 'META-INF/encryption.xml http://ns.adobe.com/adept';
      const bytes = new TextEncoder().encode(epubContent);
      const result = checkEpubDRM(bytes.buffer);
      expect(result.hasDRM).toBe(true);
      expect(result.type).toBe('Adobe ADEPT');
    });

    it('should detect LCP DRM', () => {
      const epubContent = 'content license.lcpl encryption';
      const bytes = new TextEncoder().encode(epubContent);
      const result = checkEpubDRM(bytes.buffer);
      expect(result.hasDRM).toBe(true);
      expect(result.type).toBe('Readium LCP');
    });

    it('should detect generic encryption', () => {
      const epubContent = 'META-INF/encryption.xml some content';
      const bytes = new TextEncoder().encode(epubContent);
      const result = checkEpubDRM(bytes.buffer);
      expect(result.hasDRM).toBe(true);
      expect(result.type).toBe('Encrypted content');
    });

    it('should return false for unencrypted EPUB', () => {
      const epubContent = 'META-INF/container.xml content.opf';
      const bytes = new TextEncoder().encode(epubContent);
      const result = checkEpubDRM(bytes.buffer);
      expect(result.hasDRM).toBe(false);
    });
  });

  describe('checkDRM', () => {
    it('should route to correct format checker for PDF', () => {
      const pdfContent = '%PDF-1.4\n/Encrypt\ntrailer';
      const bytes = new TextEncoder().encode(pdfContent);
      const result = checkDRM(bytes.buffer, 'pdf');
      expect(result.hasDRM).toBe(true);
    });

    it('should route to correct format checker for EPUB', () => {
      const epubContent = 'META-INF/encryption.xml content';
      const bytes = new TextEncoder().encode(epubContent);
      const result = checkDRM(bytes.buffer, 'epub');
      expect(result.hasDRM).toBe(true);
    });

    it('should return false for CBZ (no DRM support)', () => {
      const cbzContent = 'some image data';
      const bytes = new TextEncoder().encode(cbzContent);
      const result = checkDRM(bytes.buffer, 'cbz');
      expect(result.hasDRM).toBe(false);
    });
  });
});
