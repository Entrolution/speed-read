import type {
  DocumentFormat,
  FormatReader,
  ReaderProps,
  ReaderSource,
  ReaderError,
  ReaderNavigation,
} from '@/types';
import { loadAndValidate, detectFormat } from './validation';
import { ManifestController } from './manifest-controller';
import { loadReader } from '@/readers';

/**
 * Core reader engine
 * Orchestrates validation, format detection, and reader loading
 */
export class ReaderEngine {
  private container: HTMLElement | null = null;
  private reader: FormatReader | null = null;
  private manifestController: ManifestController | null = null;
  private currentFormat: DocumentFormat | null = null;

  // Callbacks
  private onError?: (error: ReaderError) => void;
  private onPageChange?: (page: number, total: number) => void;
  private onChapterChange?: (chapter: number, total: number) => void;
  private onReady?: () => void;

  /**
   * Initialize the engine with a container and props
   */
  async init(container: HTMLElement, props: ReaderProps): Promise<void> {
    this.container = container;
    this.onError = props.onError;
    this.onPageChange = props.onPageChange;
    this.onChapterChange = props.onChapterChange;
    this.onReady = props.onReady;

    // Show loading state
    this.showLoading();

    try {
      if (props.manifest) {
        await this.loadManifest(props.manifest);
      } else if (props.src) {
        await this.loadSource(props.src);
      } else {
        throw new Error('Either src or manifest must be provided');
      }

      if (this.onReady) {
        this.onReady();
      }
    } catch (err) {
      this.handleError(err);
    }
  }

  /**
   * Load a single source (URL, File, or Blob)
   */
  private async loadSource(source: ReaderSource): Promise<void> {
    const result = await loadAndValidate(source);

    if ('error' in result) {
      throw result.error;
    }

    const { data, format } = result;
    await this.loadDocument(data, format);
  }

  /**
   * Load from a manifest URL
   */
  private async loadManifest(url: string): Promise<void> {
    this.manifestController = new ManifestController();
    this.manifestController.setCallbacks({
      onChapterChange: this.onChapterChange,
      onError: this.onError,
    });

    await this.manifestController.load(url);

    // Load first chapter
    const data = await this.manifestController.goToChapter(0);
    const format = detectFormat(data);

    if (!format) {
      throw {
        type: 'INVALID_FORMAT',
        message: 'Could not detect format of first chapter',
      } as ReaderError;
    }

    await this.loadDocument(data, format);

    // Preload adjacent chapters in background
    this.manifestController.preloadAdjacent();
  }

  /**
   * Load a document into the appropriate reader
   */
  private async loadDocument(data: ArrayBuffer, format: DocumentFormat): Promise<void> {
    if (!this.container) return;

    // Clean up previous reader if exists
    if (this.reader) {
      this.reader.destroy();
    }

    // Load the format-specific reader
    this.reader = await loadReader(format);
    this.currentFormat = format;

    // Hide loading state and show reader
    this.hideLoading();

    // Set up page change callback on reader if it supports it
    const readerAny = this.reader as unknown as {
      setOnPageChange?: (cb: (page: number, total: number) => void) => void;
    };
    if (readerAny.setOnPageChange && this.onPageChange) {
      readerAny.setOnPageChange(this.onPageChange);
    }

    // Load the document
    await this.reader.load(data, this.container);
  }

  /**
   * Navigate to next page
   */
  async next(): Promise<void> {
    if (!this.reader) return;

    const nav = this.reader.getNavigation();

    // If at last page and have manifest, try next chapter
    if (nav.currentPage >= nav.totalPages && this.manifestController) {
      const nextData = await this.manifestController.nextChapter();
      if (nextData) {
        const format = detectFormat(nextData);
        if (format) {
          await this.loadDocument(nextData, format);
          this.manifestController.preloadAdjacent();
        }
        return;
      }
    }

    await nav.next();
  }

  /**
   * Navigate to previous page
   */
  async prev(): Promise<void> {
    if (!this.reader) return;

    const nav = this.reader.getNavigation();

    // If at first page and have manifest, try previous chapter
    if (nav.currentPage <= 1 && this.manifestController) {
      const prevData = await this.manifestController.prevChapter();
      if (prevData) {
        const format = detectFormat(prevData);
        if (format) {
          await this.loadDocument(prevData, format);
          // Go to last page of previous chapter
          const newNav = this.reader!.getNavigation();
          await newNav.goTo(newNav.totalPages);
          this.manifestController.preloadAdjacent();
        }
        return;
      }
    }

    await nav.prev();
  }

  /**
   * Get navigation controls
   */
  getNavigation(): ReaderNavigation | null {
    return this.reader?.getNavigation() ?? null;
  }

  /**
   * Get current format
   */
  getFormat(): DocumentFormat | null {
    return this.currentFormat;
  }

  /**
   * Check if using manifest mode
   */
  hasManifest(): boolean {
    return this.manifestController !== null;
  }

  /**
   * Get manifest controller
   */
  getManifestController(): ManifestController | null {
    return this.manifestController;
  }

  /**
   * Show loading indicator with optional progress
   */
  private showLoading(message = 'Loading...', progress?: number): void {
    if (!this.container) return;

    const progressValue = progress !== undefined ? Math.round(progress) : undefined;
    const progressBar = progressValue !== undefined
      ? `<div class="speed-reader-progress" role="progressbar" aria-valuenow="${progressValue}" aria-valuemin="0" aria-valuemax="100" aria-label="Loading progress">
           <div class="speed-reader-progress-bar" style="width: ${progressValue}%"></div>
         </div>
         <p class="speed-reader-progress-text" aria-hidden="true">${progressValue}%</p>`
      : '';

    this.container.innerHTML = `
      <div class="speed-reader-loading" role="status" aria-live="polite" aria-label="${message}">
        <div class="speed-reader-spinner" aria-hidden="true"></div>
        <p>${message}</p>
        ${progressBar}
      </div>
    `;
  }

  /**
   * Update loading progress
   */
  updateProgress(loaded: number, total: number): void {
    const progress = total > 0 ? (loaded / total) * 100 : 0;
    const loadedMB = (loaded / (1024 * 1024)).toFixed(1);
    const totalMB = (total / (1024 * 1024)).toFixed(1);
    this.showLoading(`Loading... ${loadedMB}MB / ${totalMB}MB`, progress);
  }

  /**
   * Hide loading indicator
   */
  private hideLoading(): void {
    if (!this.container) return;
    this.container.innerHTML = '';
  }

  /**
   * Get error icon based on error type
   */
  private getErrorIcon(type: ReaderError['type']): string {
    switch (type) {
      case 'DRM_PROTECTED': return '🔒';
      case 'NETWORK_ERROR': return '📡';
      case 'TIMEOUT': return '⏱️';
      case 'FILE_TOO_LARGE': return '📦';
      case 'CORS_ERROR': return '🚫';
      case 'INVALID_FORMAT': return '📄';
      case 'MALFORMED_FILE': return '⚠️';
      default: return '❌';
    }
  }

  /**
   * Get error title based on error type
   */
  private getErrorTitle(type: ReaderError['type']): string {
    switch (type) {
      case 'DRM_PROTECTED': return 'Protected Content';
      case 'NETWORK_ERROR': return 'Connection Error';
      case 'TIMEOUT': return 'Loading Timeout';
      case 'FILE_TOO_LARGE': return 'File Too Large';
      case 'CORS_ERROR': return 'Access Denied';
      case 'INVALID_FORMAT': return 'Unsupported Format';
      case 'MALFORMED_FILE': return 'Invalid File';
      case 'RENDER_ERROR': return 'Display Error';
      default: return 'Error';
    }
  }

  /**
   * Show error state with guidance and retry option
   */
  private showError(error: ReaderError): void {
    if (!this.container) return;

    const icon = this.getErrorIcon(error.type);
    const title = this.getErrorTitle(error.type);
    const guidance = error.guidance
      ? `<p class="speed-reader-error-guidance">${error.guidance}</p>`
      : '';
    const retryButton = error.retryable
      ? `<button class="speed-reader-retry-btn" onclick="this.closest('.speed-reader-error').dispatchEvent(new CustomEvent('retry', { bubbles: true }))" aria-label="Retry loading the document">Try Again</button>`
      : '';

    this.container.innerHTML = `
      <div class="speed-reader-error" role="alert" aria-live="assertive">
        <div class="speed-reader-error-icon" aria-hidden="true">${icon}</div>
        <h2 id="error-title">${title}</h2>
        <p class="speed-reader-error-message" id="error-message">${error.message}</p>
        ${guidance}
        ${retryButton}
      </div>
    `;
  }

  /**
   * Handle errors
   */
  private handleError(err: unknown): void {
    const error: ReaderError =
      err && typeof err === 'object' && 'type' in err
        ? (err as ReaderError)
        : {
            type: 'UNKNOWN',
            message: err instanceof Error ? err.message : 'An unknown error occurred',
            details: err,
          };

    this.hideLoading();
    this.showError(error);

    if (this.onError) {
      this.onError(error);
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.reader) {
      this.reader.destroy();
      this.reader = null;
    }
    if (this.manifestController) {
      this.manifestController.destroy();
      this.manifestController = null;
    }
    if (this.container) {
      this.container.innerHTML = '';
    }
    this.container = null;
    this.currentFormat = null;

    // Clear callbacks to prevent closure leaks
    this.onError = undefined;
    this.onPageChange = undefined;
    this.onChapterChange = undefined;
    this.onReady = undefined;
  }
}
