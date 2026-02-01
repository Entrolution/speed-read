import type { FormatReader, ReaderNavigation } from '@/types';
import { PageController } from '@/core/controller';

/**
 * Base class for format-specific readers
 * Provides common functionality and page controller integration
 */
export abstract class BaseReader implements FormatReader {
  protected container: HTMLElement | null = null;
  protected pageController: PageController;
  protected isLoaded = false;

  constructor() {
    this.pageController = new PageController();
  }

  /**
   * Load document data into the reader
   */
  abstract load(data: ArrayBuffer, container: HTMLElement): Promise<void>;

  /**
   * Render a specific page
   */
  protected abstract renderPage(page: number): Promise<void>;

  /**
   * Get the total number of pages in the document
   */
  protected abstract getPageCount(): number;

  /**
   * Initialize the page controller after loading
   */
  protected initController(
    container: HTMLElement,
    onPageChange?: (page: number, total: number) => void
  ): void {
    this.container = container;
    this.pageController.init(container, {
      totalPages: this.getPageCount(),
      onPageChange,
      renderPage: this.renderPage.bind(this),
    });
  }

  /**
   * Get navigation controls
   */
  getNavigation(): ReaderNavigation {
    return this.pageController;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.pageController.destroy();
    this.container = null;
    this.isLoaded = false;
  }
}
