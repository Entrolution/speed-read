import type { DocumentFormat, FormatReader } from '@/types';

export { BaseReader } from './base-reader';
export { EpubReader } from './epub-reader';
export { PdfReader } from './pdf-reader';
export { CbzReader } from './cbz-reader';

/**
 * Dynamically load the appropriate reader for a format
 * This enables code splitting - readers are only loaded when needed
 */
export async function loadReader(format: DocumentFormat): Promise<FormatReader> {
  switch (format) {
    case 'epub': {
      const { EpubReader } = await import('./epub-reader');
      return new EpubReader();
    }
    case 'pdf': {
      const { PdfReader } = await import('./pdf-reader');
      return new PdfReader();
    }
    case 'cbz': {
      const { CbzReader } = await import('./cbz-reader');
      return new CbzReader();
    }
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}
