import type {
  DocumentFormat,
  ReaderSource,
  ValidationResult,
  ReaderError,
} from '@/types';
import { detectFormat } from './magic-bytes';
import { checkDRM } from './drm';

export { detectFormat, isValidFormat } from './magic-bytes';
export { checkDRM, checkEpubDRM, checkPdfDRM } from './drm';

/**
 * File size limits by format (in bytes)
 */
const SIZE_LIMITS: Record<DocumentFormat, number> = {
  epub: 100 * 1024 * 1024, // 100MB
  pdf: 50 * 1024 * 1024,   // 50MB
  cbz: 200 * 1024 * 1024,  // 200MB
};

/**
 * Create a ReaderError object
 */
function createError(
  type: ReaderError['type'],
  message: string,
  format?: DocumentFormat,
  details?: unknown
): ReaderError {
  return { type, message, format, details };
}

/**
 * Validate file size against format limits
 */
export function validateFileSize(
  size: number,
  format: DocumentFormat
): ValidationResult {
  const limit = SIZE_LIMITS[format];
  if (size > limit) {
    const limitMB = Math.round(limit / (1024 * 1024));
    return {
      valid: false,
      error: createError(
        'FILE_TOO_LARGE',
        `File size exceeds ${limitMB}MB limit for ${format.toUpperCase()} files`,
        format
      ),
    };
  }
  return { valid: true, format };
}

/**
 * Validate file format using magic bytes
 */
export function validateFormat(data: ArrayBuffer): ValidationResult {
  const format = detectFormat(data);
  if (!format) {
    return {
      valid: false,
      error: createError(
        'INVALID_FORMAT',
        'Unrecognized file format. Supported formats: EPUB, PDF, CBZ'
      ),
    };
  }
  return { valid: true, format };
}

/**
 * Validate file for DRM protection
 */
export function validateDRM(
  data: ArrayBuffer,
  format: DocumentFormat
): ValidationResult {
  const drmResult = checkDRM(data, format);
  if (drmResult.hasDRM) {
    return {
      valid: false,
      format,
      error: createError(
        'DRM_PROTECTED',
        `This file contains DRM protection (${drmResult.type}) and cannot be viewed in this reader. Please use the authorized app from your content provider.`,
        format,
        { drmType: drmResult.type }
      ),
    };
  }
  return { valid: true, format };
}

/**
 * Run all validations on file data
 */
export function validateFile(
  data: ArrayBuffer,
  _expectedFormat?: DocumentFormat
): ValidationResult {
  // Check format
  const formatResult = validateFormat(data);
  if (!formatResult.valid) {
    return formatResult;
  }

  const format = formatResult.format!;

  // Check size
  const sizeResult = validateFileSize(data.byteLength, format);
  if (!sizeResult.valid) {
    return sizeResult;
  }

  // Check DRM
  const drmResult = validateDRM(data, format);
  if (!drmResult.valid) {
    return drmResult;
  }

  return { valid: true, format };
}

/**
 * Load and validate a source (URL, File, or Blob)
 */
export async function loadAndValidate(
  source: ReaderSource
): Promise<{ data: ArrayBuffer; format: DocumentFormat } | { error: ReaderError }> {
  try {
    let data: ArrayBuffer;

    if (typeof source === 'string') {
      // URL - fetch the resource
      const response = await fetch(source);
      if (!response.ok) {
        if (response.status === 0 || response.type === 'opaque') {
          return {
            error: createError(
              'CORS_ERROR',
              'Unable to load file due to cross-origin restrictions. The server may not allow requests from this domain.'
            ),
          };
        }
        return {
          error: createError(
            'LOAD_FAILED',
            `Failed to load file: ${response.status} ${response.statusText}`
          ),
        };
      }
      data = await response.arrayBuffer();
    } else if (source instanceof File || source instanceof Blob) {
      data = await source.arrayBuffer();
    } else {
      return {
        error: createError('INVALID_FORMAT', 'Invalid source type provided'),
      };
    }

    const validation = validateFile(data);
    if (!validation.valid) {
      return { error: validation.error! };
    }

    return { data, format: validation.format! };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      error: createError('LOAD_FAILED', `Failed to load file: ${message}`, undefined, err),
    };
  }
}
