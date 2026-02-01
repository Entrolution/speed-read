import type { DocumentFormat } from '@/types';

/**
 * Magic byte signatures for supported formats
 */
const MAGIC_BYTES = {
  PDF: [0x25, 0x50, 0x44, 0x46, 0x2d], // %PDF-
  ZIP: [0x50, 0x4b, 0x03, 0x04],       // PK (ZIP archive - used by EPUB and CBZ)
} as const;

/**
 * EPUB mimetype that must be present in the archive
 */
const EPUB_MIMETYPE = 'application/epub+zip';

/**
 * Check if data starts with specific bytes
 */
function startsWith(data: Uint8Array, signature: readonly number[]): boolean {
  if (data.length < signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (data[i] !== signature[i]) return false;
  }
  return true;
}

/**
 * Detect document format from magic bytes
 * @param data - First bytes of the file (at least 64 bytes recommended)
 * @returns Detected format or null if unrecognized
 */
export function detectFormat(data: ArrayBuffer): DocumentFormat | null {
  const bytes = new Uint8Array(data);

  // Check for PDF
  if (startsWith(bytes, MAGIC_BYTES.PDF)) {
    return 'pdf';
  }

  // Check for ZIP (could be EPUB or CBZ)
  if (startsWith(bytes, MAGIC_BYTES.ZIP)) {
    // Need to check for EPUB mimetype file
    // In a ZIP, the first file entry starts at offset 30
    // The EPUB spec requires 'mimetype' to be the first file, uncompressed
    const mimetypeCheck = checkEpubMimetype(bytes);
    if (mimetypeCheck) {
      return 'epub';
    }
    // If not EPUB, assume CBZ (comic book archive)
    return 'cbz';
  }

  return null;
}

/**
 * Check if a ZIP file is an EPUB by looking for the mimetype file
 */
function checkEpubMimetype(bytes: Uint8Array): boolean {
  // ZIP local file header structure:
  // 0-3: signature (PK\x03\x04)
  // 4-5: version needed
  // 6-7: flags
  // 8-9: compression method (should be 0 for uncompressed)
  // 10-13: mod time/date
  // 14-17: CRC32
  // 18-21: compressed size
  // 22-25: uncompressed size
  // 26-27: filename length
  // 28-29: extra field length
  // 30+: filename

  if (bytes.length < 38) return false;

  const filenameLength = bytes[26] | (bytes[27] << 8);
  const extraLength = bytes[28] | (bytes[29] << 8);

  // Check if filename is 'mimetype' (8 characters)
  if (filenameLength !== 8) return false;

  const filename = String.fromCharCode(...bytes.slice(30, 38));
  if (filename !== 'mimetype') return false;

  // Check compression method is 0 (stored, uncompressed)
  const compressionMethod = bytes[8] | (bytes[9] << 8);
  if (compressionMethod !== 0) return false;

  // Read the content of mimetype file
  const contentStart = 30 + filenameLength + extraLength;
  const uncompressedSize = bytes[22] | (bytes[23] << 8) | (bytes[24] << 16) | (bytes[25] << 24);

  if (bytes.length < contentStart + uncompressedSize) return false;

  const content = String.fromCharCode(...bytes.slice(contentStart, contentStart + uncompressedSize));

  return content.trim() === EPUB_MIMETYPE;
}

/**
 * Check if data appears to be a valid format
 */
export function isValidFormat(data: ArrayBuffer): boolean {
  return detectFormat(data) !== null;
}
