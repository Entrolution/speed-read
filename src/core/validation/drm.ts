import type { DocumentFormat } from '@/types';

/**
 * DRM indicators found in EPUB files
 */
const EPUB_DRM_INDICATORS = {
  /** Adobe ADEPT DRM - look for encryption.xml with ADEPT algorithm */
  ADEPT_ALGORITHM: 'http://ns.adobe.com/adept',
  /** Readium LCP - presence of license file */
  LCP_LICENSE: 'license.lcpl',
  /** Apple FairPlay - specific encryption method */
  FAIRPLAY: 'http://www.apple.com',
  /** Generic encryption.xml presence */
  ENCRYPTION_XML: 'META-INF/encryption.xml',
} as const;

/**
 * DRM indicators found in PDF files
 */
const PDF_DRM_INDICATORS = {
  /** Encrypt dictionary in PDF trailer */
  ENCRYPT_DICT: '/Encrypt',
  /** Standard security handler */
  STANDARD_HANDLER: '/Standard',
  /** Adobe PDF DRM */
  ADOBE_DRM: '/ADBEPDF',
} as const;

/**
 * Result of DRM check
 */
export interface DRMCheckResult {
  hasDRM: boolean;
  type?: string;
}

/**
 * Check EPUB for DRM protection
 * This performs a quick scan for common DRM indicators
 */
export function checkEpubDRM(data: ArrayBuffer): DRMCheckResult {
  const bytes = new Uint8Array(data);
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);

  // Check for encryption.xml in the ZIP central directory
  if (text.includes(EPUB_DRM_INDICATORS.ENCRYPTION_XML)) {
    // Further check for specific DRM types
    if (text.includes(EPUB_DRM_INDICATORS.ADEPT_ALGORITHM)) {
      return { hasDRM: true, type: 'Adobe ADEPT' };
    }
    if (text.includes(EPUB_DRM_INDICATORS.FAIRPLAY)) {
      return { hasDRM: true, type: 'Apple FairPlay' };
    }
    // Generic encryption detected
    return { hasDRM: true, type: 'Encrypted content' };
  }

  // Check for LCP DRM
  if (text.includes(EPUB_DRM_INDICATORS.LCP_LICENSE)) {
    return { hasDRM: true, type: 'Readium LCP' };
  }

  return { hasDRM: false };
}

/**
 * Check PDF for DRM/encryption
 * This scans the PDF trailer and catalog for encryption dictionaries
 */
export function checkPdfDRM(data: ArrayBuffer): DRMCheckResult {
  const bytes = new Uint8Array(data);

  // PDF trailers are at the end of the file
  // Check last 2KB for encryption indicators
  const tailSize = Math.min(2048, bytes.length);
  const tail = bytes.slice(-tailSize);
  const text = new TextDecoder('utf-8', { fatal: false }).decode(tail);

  // Also check the beginning for linearized PDFs
  const headSize = Math.min(2048, bytes.length);
  const head = bytes.slice(0, headSize);
  const headText = new TextDecoder('utf-8', { fatal: false }).decode(head);

  const combinedText = headText + text;

  // Check for /Encrypt dictionary
  if (combinedText.includes(PDF_DRM_INDICATORS.ENCRYPT_DICT)) {
    if (combinedText.includes(PDF_DRM_INDICATORS.ADOBE_DRM)) {
      return { hasDRM: true, type: 'Adobe PDF DRM' };
    }
    if (combinedText.includes(PDF_DRM_INDICATORS.STANDARD_HANDLER)) {
      return { hasDRM: true, type: 'Password protected' };
    }
    return { hasDRM: true, type: 'Encrypted PDF' };
  }

  return { hasDRM: false };
}

/**
 * Check any supported format for DRM
 */
export function checkDRM(data: ArrayBuffer, format: DocumentFormat): DRMCheckResult {
  switch (format) {
    case 'epub':
      return checkEpubDRM(data);
    case 'pdf':
      return checkPdfDRM(data);
    case 'cbz':
      // CBZ files don't typically have DRM
      return { hasDRM: false };
  }
}
