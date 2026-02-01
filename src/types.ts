/**
 * Supported document formats
 */
export type DocumentFormat = 'epub' | 'pdf' | 'cbz';

/**
 * Error types that can be emitted by the reader
 */
export type ReaderErrorType =
  | 'FILE_TOO_LARGE'
  | 'INVALID_FORMAT'
  | 'DRM_PROTECTED'
  | 'LOAD_FAILED'
  | 'CORS_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'MALFORMED_FILE'
  | 'RENDER_ERROR'
  | 'UNKNOWN';

/**
 * Error object emitted through onError callback
 */
export interface ReaderError {
  type: ReaderErrorType;
  message: string;
  format?: DocumentFormat;
  details?: unknown;
  /** User-friendly guidance on how to resolve the error */
  guidance?: string;
  /** Whether the operation can be retried */
  retryable?: boolean;
}

/**
 * Chapter entry in a manifest file
 */
export interface ManifestChapter {
  src: string;
  title: string;
}

/**
 * Manifest format for episodic content
 */
export interface Manifest {
  title: string;
  chapters: ManifestChapter[];
}

/**
 * Input source types supported by the reader
 */
export type ReaderSource = string | File | Blob;

/**
 * Props interface for the reader component
 */
export interface ReaderProps {
  /** Single file source - URL, File, or Blob */
  src?: ReaderSource;

  /** URL to a chapters.json manifest for episodic content */
  manifest?: string;

  /** Callback fired when an error occurs */
  onError?: (error: ReaderError) => void;

  /** Callback fired when page changes */
  onPageChange?: (page: number, total: number) => void;

  /** Callback fired when chapter changes (manifest mode) */
  onChapterChange?: (chapter: number, total: number) => void;

  /** Callback fired when document is ready */
  onReady?: () => void;
}

/**
 * Navigation controls exposed by the reader
 */
export interface ReaderNavigation {
  /** Go to next page */
  next(): Promise<void>;

  /** Go to previous page */
  prev(): Promise<void>;

  /** Go to specific page */
  goTo(page: number): Promise<void>;

  /** Current page number (1-indexed) */
  currentPage: number;

  /** Total number of pages */
  totalPages: number;
}

/**
 * Interface for format-specific readers
 */
export interface FormatReader {
  /** Load a document from ArrayBuffer */
  load(data: ArrayBuffer, container: HTMLElement): Promise<void>;

  /** Clean up resources */
  destroy(): void;

  /** Get navigation controls */
  getNavigation(): ReaderNavigation;
}

/**
 * Validation result for file checks
 */
export interface ValidationResult {
  valid: boolean;
  format?: DocumentFormat;
  error?: ReaderError;
}

/**
 * File size limits by format (in bytes)
 */
export const MAX_FILE_SIZES: Record<DocumentFormat, number> = {
  epub: 100 * 1024 * 1024, // 100MB
  pdf: 50 * 1024 * 1024,   // 50MB
  cbz: 200 * 1024 * 1024,  // 200MB
};
