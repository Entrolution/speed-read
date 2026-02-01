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
 * Default fetch options
 */
const DEFAULT_FETCH_OPTIONS = {
  timeout: 30000, // 30 seconds
  retries: 3,
  retryDelay: 1000, // 1 second
};

/**
 * Create a ReaderError object with guidance
 */
function createError(
  type: ReaderError['type'],
  message: string,
  options?: {
    format?: DocumentFormat;
    details?: unknown;
    guidance?: string;
    retryable?: boolean;
  }
): ReaderError {
  return {
    type,
    message,
    format: options?.format,
    details: options?.details,
    guidance: options?.guidance,
    retryable: options?.retryable ?? false,
  };
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
    const sizeMB = Math.round(size / (1024 * 1024));
    return {
      valid: false,
      error: createError(
        'FILE_TOO_LARGE',
        `File size (${sizeMB}MB) exceeds the ${limitMB}MB limit for ${format.toUpperCase()} files.`,
        {
          format,
          guidance: `Try using a smaller file or compressing the ${format.toUpperCase()} before uploading.`,
        }
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
        'This file format is not supported.',
        {
          guidance: 'Supported formats are: EPUB (.epub), PDF (.pdf), and CBZ (.cbz). Make sure your file has the correct extension and is not corrupted.',
        }
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
        `This file is protected with ${drmResult.type || 'DRM'} and cannot be opened here.`,
        {
          format,
          details: { drmType: drmResult.type },
          guidance: 'DRM-protected files can only be read in authorized apps from the content provider. Try using the official reader app for this content.',
        }
      ),
    };
  }
  return { valid: true, format };
}

/**
 * Check if data appears to be a valid/complete file
 */
export function validateFileIntegrity(
  data: ArrayBuffer,
  format: DocumentFormat
): ValidationResult {
  // Basic integrity checks based on format
  const bytes = new Uint8Array(data);

  if (format === 'pdf') {
    // PDF should end with %%EOF (with possible whitespace)
    const tail = new TextDecoder().decode(bytes.slice(-32));
    if (!tail.includes('%%EOF')) {
      return {
        valid: false,
        format,
        error: createError(
          'MALFORMED_FILE',
          'This PDF file appears to be incomplete or corrupted.',
          {
            format,
            guidance: 'The file may have been partially downloaded. Try downloading it again.',
            retryable: true,
          }
        ),
      };
    }
  }

  if (format === 'epub' || format === 'cbz') {
    // ZIP files should have end of central directory signature
    let hasEOCD = false;
    for (let i = data.byteLength - 22; i >= Math.max(0, data.byteLength - 65557); i--) {
      if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b &&
          bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) {
        hasEOCD = true;
        break;
      }
    }
    if (!hasEOCD) {
      return {
        valid: false,
        format,
        error: createError(
          'MALFORMED_FILE',
          `This ${format.toUpperCase()} file appears to be incomplete or corrupted.`,
          {
            format,
            guidance: 'The file may have been partially downloaded. Try downloading it again.',
            retryable: true,
          }
        ),
      };
    }
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

  // Check file integrity
  const integrityResult = validateFileIntegrity(data, format);
  if (!integrityResult.valid) {
    return integrityResult;
  }

  return { valid: true, format };
}

/**
 * Fetch with timeout support
 */
async function fetchWithTimeout(
  url: string,
  timeout: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Sleep helper for retry delay
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Load and validate a source (URL, File, or Blob)
 */
export async function loadAndValidate(
  source: ReaderSource,
  options?: {
    timeout?: number;
    retries?: number;
    retryDelay?: number;
    onProgress?: (loaded: number, total: number) => void;
  }
): Promise<{ data: ArrayBuffer; format: DocumentFormat } | { error: ReaderError }> {
  const opts = { ...DEFAULT_FETCH_OPTIONS, ...options };

  try {
    let data: ArrayBuffer;

    if (typeof source === 'string') {
      // URL - fetch with retry logic
      let lastError: Error | null = null;

      for (let attempt = 0; attempt < opts.retries; attempt++) {
        try {
          const response = await fetchWithTimeout(source, opts.timeout);

          if (!response.ok) {
            if (response.status === 0 || response.type === 'opaque') {
              return {
                error: createError(
                  'CORS_ERROR',
                  'Cannot load this file due to cross-origin restrictions.',
                  {
                    guidance: 'The server hosting this file does not allow requests from this website. Try downloading the file and uploading it directly instead.',
                  }
                ),
              };
            }

            if (response.status === 404) {
              return {
                error: createError(
                  'LOAD_FAILED',
                  'File not found.',
                  {
                    guidance: 'Check that the URL is correct. The file may have been moved or deleted.',
                  }
                ),
              };
            }

            if (response.status >= 500) {
              lastError = new Error(`Server error: ${response.status}`);
              if (attempt < opts.retries - 1) {
                await sleep(opts.retryDelay * (attempt + 1));
                continue;
              }
              return {
                error: createError(
                  'NETWORK_ERROR',
                  `Server error (${response.status}). Please try again later.`,
                  {
                    guidance: 'The server may be temporarily unavailable. Wait a moment and try again.',
                    retryable: true,
                    details: { status: response.status },
                  }
                ),
              };
            }

            return {
              error: createError(
                'LOAD_FAILED',
                `Failed to load file: ${response.status} ${response.statusText}`,
                {
                  details: { status: response.status, statusText: response.statusText },
                }
              ),
            };
          }

          // Get content length for progress
          const contentLength = response.headers.get('content-length');
          const total = contentLength ? parseInt(contentLength, 10) : 0;

          if (opts.onProgress && total > 0) {
            // Stream response for progress tracking
            const reader = response.body?.getReader();
            if (reader) {
              const chunks: Uint8Array[] = [];
              let loaded = 0;
              let done = false;

              while (!done) {
                const readResult = await reader.read();
                done = readResult.done;
                if (!done && readResult.value) {
                  chunks.push(readResult.value);
                  loaded += readResult.value.length;
                  opts.onProgress(loaded, total);
                }
              }

              const result = new Uint8Array(loaded);
              let position = 0;
              for (const chunk of chunks) {
                result.set(chunk, position);
                position += chunk.length;
              }
              data = result.buffer;
            } else {
              data = await response.arrayBuffer();
            }
          } else {
            data = await response.arrayBuffer();
          }

          break; // Success, exit retry loop
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));

          if (lastError.name === 'AbortError') {
            if (attempt < opts.retries - 1) {
              await sleep(opts.retryDelay * (attempt + 1));
              continue;
            }
            return {
              error: createError(
                'TIMEOUT',
                'The file took too long to load.',
                {
                  guidance: 'Check your internet connection and try again. If the file is large, it may take longer to load.',
                  retryable: true,
                }
              ),
            };
          }

          // Network error - retry if not last attempt
          if (attempt < opts.retries - 1) {
            await sleep(opts.retryDelay * (attempt + 1));
            continue;
          }

          return {
            error: createError(
              'NETWORK_ERROR',
              'Could not connect to load the file.',
              {
                guidance: 'Check your internet connection and try again.',
                retryable: true,
                details: lastError,
              }
            ),
          };
        }
      }

      // If we got here without data, something went wrong
      if (!data!) {
        return {
          error: createError(
            'LOAD_FAILED',
            `Failed to load file after ${opts.retries} attempts.`,
            {
              guidance: 'Try again later or download the file and upload it directly.',
              retryable: true,
              details: lastError,
            }
          ),
        };
      }
    } else if (source instanceof File || source instanceof Blob) {
      data = await source.arrayBuffer();
    } else {
      return {
        error: createError(
          'INVALID_FORMAT',
          'Invalid source type provided.',
          {
            guidance: 'Provide a URL, File, or Blob as the source.',
          }
        ),
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
      error: createError(
        'UNKNOWN',
        `An unexpected error occurred: ${message}`,
        {
          guidance: 'Try refreshing the page and loading the file again.',
          retryable: true,
          details: err,
        }
      ),
    };
  }
}
