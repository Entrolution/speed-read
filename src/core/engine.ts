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
   * Show loading indicator
   */
  private showLoading(): void {
    if (!this.container) return;
    this.container.innerHTML = `
      <div class="speed-reader-loading">
        <div class="speed-reader-spinner"></div>
        <p>Loading...</p>
      </div>
    `;
  }

  /**
   * Hide loading indicator
   */
  private hideLoading(): void {
    if (!this.container) return;
    this.container.innerHTML = '';
  }

  /**
   * Show error state
   */
  private showError(error: ReaderError): void {
    if (!this.container) return;

    const icon = error.type === 'DRM_PROTECTED' ? '🔒' : '⚠️';
    const title = error.type === 'DRM_PROTECTED' ? 'Protected Content' : 'Error';

    this.container.innerHTML = `
      <div class="speed-reader-error">
        <div class="speed-reader-error-icon">${icon}</div>
        <h2>${title}</h2>
        <p>${error.message}</p>
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
  }
}
