import { describe, it, expect } from 'vitest';
import { detectFormat, isValidFormat } from './magic-bytes';

describe('magic-bytes', () => {
  describe('detectFormat', () => {
    it('should detect PDF format', () => {
      // %PDF-1.4
      const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
      expect(detectFormat(pdfBytes.buffer as ArrayBuffer)).toBe('pdf');
    });

    it('should detect EPUB format from valid EPUB file', () => {
      // Create a minimal EPUB-like ZIP structure
      // This is a simplified test - real EPUB detection checks the mimetype file
      const epubBytes = createMinimalEpubBytes();
      expect(detectFormat(epubBytes.buffer as ArrayBuffer)).toBe('epub');
    });

    it('should detect CBZ format from generic ZIP', () => {
      // PK\x03\x04 (ZIP signature) without EPUB mimetype
      const zipBytes = new Uint8Array([
        0x50, 0x4b, 0x03, 0x04, // ZIP signature
        0x14, 0x00, // version
        0x00, 0x00, // flags
        0x08, 0x00, // compression (deflate)
        0x00, 0x00, 0x00, 0x00, // mod time/date
        0x00, 0x00, 0x00, 0x00, // CRC
        0x00, 0x00, 0x00, 0x00, // compressed size
        0x00, 0x00, 0x00, 0x00, // uncompressed size
        0x05, 0x00, // filename length (5)
        0x00, 0x00, // extra length
        0x61, 0x2e, 0x6a, 0x70, 0x67, // "a.jpg"
      ]);
      expect(detectFormat(zipBytes.buffer as ArrayBuffer)).toBe('cbz');
    });

    it('should return null for unknown format', () => {
      const unknownBytes = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
      expect(detectFormat(unknownBytes.buffer as ArrayBuffer)).toBeNull();
    });

    it('should return null for empty data', () => {
      const emptyBytes = new Uint8Array([]);
      expect(detectFormat(emptyBytes.buffer as ArrayBuffer)).toBeNull();
    });
  });

  describe('isValidFormat', () => {
    it('should return true for valid PDF', () => {
      const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
      expect(isValidFormat(pdfBytes.buffer as ArrayBuffer)).toBe(true);
    });

    it('should return true for valid ZIP', () => {
      const zipBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
      expect(isValidFormat(zipBytes.buffer as ArrayBuffer)).toBe(true);
    });

    it('should return false for invalid format', () => {
      const invalidBytes = new Uint8Array([0xff, 0xfe, 0x00, 0x01]);
      expect(isValidFormat(invalidBytes.buffer as ArrayBuffer)).toBe(false);
    });
  });
});

/**
 * Create a minimal valid EPUB-like byte array
 * EPUB requires: mimetype file as first entry, uncompressed, containing "application/epub+zip"
 */
function createMinimalEpubBytes(): Uint8Array {
  const mimetype = 'application/epub+zip';
  const mimetypeBytes = new TextEncoder().encode(mimetype);
  const filename = 'mimetype';
  const filenameBytes = new TextEncoder().encode(filename);

  // Local file header for mimetype (uncompressed)
  const header = new Uint8Array([
    0x50, 0x4b, 0x03, 0x04, // ZIP signature
    0x14, 0x00,             // version needed (2.0)
    0x00, 0x00,             // flags
    0x00, 0x00,             // compression method (stored/no compression)
    0x00, 0x00,             // mod time
    0x00, 0x00,             // mod date
    0x00, 0x00, 0x00, 0x00, // CRC32 (placeholder)
    mimetypeBytes.length, 0x00, 0x00, 0x00, // compressed size
    mimetypeBytes.length, 0x00, 0x00, 0x00, // uncompressed size
    filenameBytes.length, 0x00, // filename length
    0x00, 0x00,             // extra field length
  ]);

  // Combine header + filename + content
  const result = new Uint8Array(header.length + filenameBytes.length + mimetypeBytes.length);
  result.set(header, 0);
  result.set(filenameBytes, header.length);
  result.set(mimetypeBytes, header.length + filenameBytes.length);

  return result;
}
