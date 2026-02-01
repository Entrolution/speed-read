import { BaseReader } from './base-reader';

// Dynamic import for epub.js to enable code splitting
type EpubBook = {
  renderTo: (container: HTMLElement, options: object) => Rendition;
  ready: Promise<void>;
  loaded: {
    spine: Promise<Spine>;
  };
  destroy: () => void;
};

type Rendition = {
  display: (target?: string | number) => Promise<void>;
  next: () => Promise<void>;
  prev: () => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on: (event: string, callback: (...args: any[]) => void) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  off: (event: string, callback: (...args: any[]) => void) => void;
  destroy: () => void;
};

type Spine = {
  length: number;
  items: SpineItem[];
};

type SpineItem = {
  index: number;
  href: string;
};

/**
 * EPUB reader using epub.js
 */
export class EpubReader extends BaseReader {
  private book: EpubBook | null = null;
  private rendition: Rendition | null = null;
  private spine: Spine | null = null;
  private currentSection = 0;
  private onPageChangeCallback?: (page: number, total: number) => void;
  private epubContainer: HTMLDivElement | null = null;

  async load(data: ArrayBuffer, container: HTMLElement): Promise<void> {
    // Dynamic import epub.js
    const ePub = await import('epubjs').then((m) => m.default);

    // Create book from ArrayBuffer
    this.book = ePub(data) as unknown as EpubBook;

    // Wait for book to be ready
    await this.book.ready;

    // Get spine for page count
    this.spine = await this.book.loaded.spine;

    // Clear container and create a dedicated div for epub.js
    container.innerHTML = '';
    this.epubContainer = document.createElement('div');
    this.epubContainer.style.cssText = 'width: 100%; height: 100%; position: absolute; top: 0; left: 0;';
    container.appendChild(this.epubContainer);

    // Get container dimensions - epub.js needs explicit pixel values
    const width = container.clientWidth || 600;
    const height = container.clientHeight || 400;

    // Create rendition with explicit dimensions
    this.rendition = this.book.renderTo(this.epubContainer, {
      width: width,
      height: height,
      spread: 'none', // Single page view
      flow: 'paginated',
    });

    // Track section changes
    this.rendition.on('relocated', (location: { start: { index: number } }) => {
      this.currentSection = location.start.index + 1;
      if (this.onPageChangeCallback) {
        this.onPageChangeCallback(this.currentSection, this.getPageCount());
      }
    });

    // Display first section
    await this.rendition.display();

    this.container = container;
    this.isLoaded = true;

    // Initialize controller
    this.initController(container, this.onPageChangeCallback);
  }

  /**
   * Set page change callback
   */
  setOnPageChange(callback: (page: number, total: number) => void): void {
    this.onPageChangeCallback = callback;
  }

  protected getPageCount(): number {
    return this.spine?.length ?? 0;
  }

  protected async renderPage(page: number): Promise<void> {
    if (!this.rendition || !this.spine) return;

    const section = this.spine.items[page - 1];
    if (section) {
      await this.rendition.display(section.href);
    }
  }

  /**
   * Navigate to next page/section
   */
  async next(): Promise<void> {
    if (this.rendition) {
      await this.rendition.next();
    }
  }

  /**
   * Navigate to previous page/section
   */
  async prev(): Promise<void> {
    if (this.rendition) {
      await this.rendition.prev();
    }
  }

  destroy(): void {
    if (this.rendition) {
      this.rendition.destroy();
      this.rendition = null;
    }
    if (this.book) {
      this.book.destroy();
      this.book = null;
    }
    this.epubContainer = null;
    this.spine = null;
    super.destroy();
  }
}
