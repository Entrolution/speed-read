import { BaseReader } from './base-reader';
import type { ReaderNavigation, TocItem, FitMode, LayoutMode } from '@/types';

// foliate-js TOC item structure
interface FoliateTocItem {
  href: string;
  label: string;
  subitems?: FoliateTocItem[];
}

// Import foliate-js types and functions
// The library uses ES modules and registers the foliate-view custom element
type FoliateView = HTMLElement & {
  open: (book: Blob | string) => Promise<void>;
  close: () => void;
  prev: () => Promise<void>;
  next: () => Promise<void>;
  goTo: (target: number | string | { fraction: number }) => Promise<void>;
  goToFraction: (fraction: number) => Promise<void>;
  init: (options: { lastLocation?: string; showTextStart?: boolean }) => Promise<void>;
  renderer?: {
    pages: number;
    page: number;
    setStyles?: (css: string) => void;
  };
  book?: {
    sections: unknown[];
    metadata?: {
      title?: string;
      creator?: string;
    };
    toc?: FoliateTocItem[];
  };
  lastLocation?: {
    fraction?: number;
    location?: { current: number; next: number; total: number };
    section?: { current: number; total: number };
    tocItem?: { label: string };
  };
  style: CSSStyleDeclaration;
};

/**
 * EPUB reader using foliate-js
 */
export class EpubReader extends BaseReader {
  private view: FoliateView | null = null;
  private wrapper: HTMLDivElement | null = null;
  private totalLocations = 0;
  private currentLocation = 1;
  private onPageChangeCallback?: (page: number, total: number) => void;
  private relocateDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingLocation: { current: number; total: number } | null = null;

  // Event handlers stored for cleanup
  private boundKeyHandler: ((e: KeyboardEvent) => void) | null = null;
  private boundRelocateHandler: EventListener | null = null;

  // Zoom and layout state
  private zoomLevel = 1.0;
  private fitMode: FitMode = 'page';
  private layoutMode: LayoutMode = '1-page';
  private cachedToc: TocItem[] | null = null;

  async load(data: ArrayBuffer, container: HTMLElement): Promise<void> {
    // Import foliate-js view module (registers foliate-view custom element)
    await import('foliate-js/view.js');

    // Clear container
    container.innerHTML = '';

    // Ensure container has proper positioning
    const computedStyle = getComputedStyle(container);
    if (computedStyle.position === 'static') {
      container.style.position = 'relative';
    }

    // Wait for layout to complete
    await new Promise(resolve => requestAnimationFrame(resolve));
    await new Promise(resolve => requestAnimationFrame(resolve));

    // Get container dimensions
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    // Create wrapper with explicit dimensions
    this.wrapper = document.createElement('div');
    this.wrapper.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      width: ${width}px;
      height: ${height}px;
    `;
    container.appendChild(this.wrapper);

    // Create the foliate-view element
    this.view = document.createElement('foliate-view') as FoliateView;
    this.view.style.cssText = `
      display: block;
      width: ${width}px;
      height: ${height}px;
    `;
    this.wrapper.appendChild(this.view);

    // Wait for elements to be fully laid out
    await new Promise(resolve => setTimeout(resolve, 50));
    await new Promise(resolve => requestAnimationFrame(resolve));

    // Convert ArrayBuffer to File for foliate-js
    const file = new File([data], 'book.epub', { type: 'application/epub+zip' });

    // Listen for page/location changes (debounced to handle multiple rapid events)
    this.boundRelocateHandler = ((e: CustomEvent) => {
      const detail = e.detail;

      // Store the latest location data
      if (detail.location) {
        this.pendingLocation = {
          current: (detail.location.current ?? 0) + 1,
          total: detail.location.total ?? 1,
        };
      } else if (detail.section) {
        this.pendingLocation = {
          current: detail.section.current + 1,
          total: detail.section.total,
        };
      }

      // Debounce: only fire callback after events settle
      if (this.relocateDebounceTimer) {
        clearTimeout(this.relocateDebounceTimer);
      }

      this.relocateDebounceTimer = setTimeout(() => {
        if (this.pendingLocation && this.onPageChangeCallback) {
          // Only update if values actually changed
          if (this.pendingLocation.current !== this.currentLocation ||
              this.pendingLocation.total !== this.totalLocations) {
            this.currentLocation = this.pendingLocation.current;
            this.totalLocations = this.pendingLocation.total;
            this.onPageChangeCallback(this.currentLocation, this.totalLocations);
          }
        }
      }, 150);
    }) as EventListener;
    this.view.addEventListener('relocate', this.boundRelocateHandler);

    // Open the book
    await this.view.open(file);

    // Get initial totals from book sections if location not available
    if (this.totalLocations === 0 && this.view.book?.sections) {
      this.totalLocations = this.view.book.sections.length;
    }

    // Initialize and display first content
    await this.view.init({ showTextStart: true });

    this.container = container;
    this.isLoaded = true;

    // Initial page callback
    if (this.onPageChangeCallback) {
      this.onPageChangeCallback(this.currentLocation, this.totalLocations);
    }

    // Set up keyboard navigation (without using PageController's renderPage)
    this.setupKeyboardNavigation(container);
  }

  /**
   * Set up keyboard navigation for EPUB
   */
  private setupKeyboardNavigation(container: HTMLElement): void {
    this.boundKeyHandler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case ' ':
          e.preventDefault();
          this.view?.next();
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          this.view?.prev();
          break;
      }
    };

    document.addEventListener('keydown', this.boundKeyHandler);

    // Make container focusable
    if (!container.hasAttribute('tabindex')) {
      container.setAttribute('tabindex', '0');
    }
  }

  /**
   * Set page change callback
   */
  setOnPageChange(callback: (page: number, total: number) => void): void {
    this.onPageChangeCallback = callback;
  }

  protected getPageCount(): number {
    return this.totalLocations;
  }

  protected async renderPage(_page: number): Promise<void> {
    // Not used - EPUB uses native foliate-js navigation
  }

  /**
   * Override getNavigation to use foliate-js native navigation
   * instead of the PageController's fraction-based navigation
   */
  override getNavigation(): ReaderNavigation {
    // Create navigation object with arrow functions to preserve 'this' context
    const nav: ReaderNavigation = {
      currentPage: this.currentLocation,
      totalPages: this.totalLocations,
      next: async () => {
        if (this.view) await this.view.next();
      },
      prev: async () => {
        if (this.view) await this.view.prev();
      },
      goTo: async (page: number) => {
        if (this.view && this.totalLocations > 0) {
          const fraction = (page - 1) / Math.max(1, this.totalLocations - 1);
          await this.view.goToFraction(fraction);
        }
      },
    };

    // Use defineProperty to make currentPage/totalPages dynamic
    Object.defineProperty(nav, 'currentPage', {
      get: () => this.currentLocation,
    });
    Object.defineProperty(nav, 'totalPages', {
      get: () => this.totalLocations,
    });

    return nav;
  }

  /**
   * Get table of contents from the EPUB
   */
  getToc(): TocItem[] {
    if (this.cachedToc) {
      return this.cachedToc;
    }

    const toc = this.view?.book?.toc;
    if (!toc) {
      return [];
    }

    let idCounter = 0;
    const convertTocItem = (item: FoliateTocItem, level: number): TocItem => {
      const tocItem: TocItem = {
        id: `epub-toc-${idCounter++}`,
        label: item.label,
        href: item.href,
        level,
      };

      if (item.subitems && item.subitems.length > 0) {
        tocItem.children = item.subitems.map(sub => convertTocItem(sub, level + 1));
      }

      return tocItem;
    };

    this.cachedToc = toc.map(item => convertTocItem(item, 0));
    return this.cachedToc;
  }

  /**
   * Navigate to a TOC item
   */
  async goToTocItem(item: TocItem): Promise<void> {
    if (this.view && item.href) {
      await this.view.goTo(item.href);
    }
  }

  /**
   * Get current zoom level
   */
  getZoom(): number {
    return this.zoomLevel;
  }

  /**
   * Set zoom level
   */
  setZoom(level: number): void {
    this.zoomLevel = Math.max(0.5, Math.min(3.0, level));
    this.fitMode = 'none';
    this.applyZoom();
  }

  /**
   * Get current fit mode
   */
  getFitMode(): FitMode {
    return this.fitMode;
  }

  /**
   * Set fit mode
   */
  setFitMode(mode: FitMode): void {
    this.fitMode = mode;
    this.applyZoom();
  }

  /**
   * Get current layout mode
   */
  getLayout(): LayoutMode {
    return this.layoutMode;
  }

  /**
   * Set layout mode (1-page or 2-page)
   */
  setLayout(layout: LayoutMode): void {
    this.layoutMode = layout;
    this.applyLayout();
  }

  /**
   * Apply zoom to the view
   */
  private applyZoom(): void {
    if (!this.view || !this.wrapper || !this.container) return;

    if (this.fitMode === 'page' || this.fitMode === 'width') {
      // Reset transform and let CSS handle fitting
      this.view.style.transform = '';
      this.view.style.transformOrigin = '';
      this.wrapper.style.overflow = 'hidden';
    } else {
      // Apply manual zoom
      this.view.style.transform = `scale(${this.zoomLevel})`;
      this.view.style.transformOrigin = 'top left';
      this.wrapper.style.overflow = 'auto';
    }
  }

  /**
   * Apply layout mode
   */
  private applyLayout(): void {
    // foliate-js handles column layout internally
    // We would need to configure this when opening the book
    // For now, this is a placeholder - real implementation would
    // need to reload the book with different column settings
  }

  destroy(): void {
    // Remove event listeners
    if (this.boundKeyHandler) {
      document.removeEventListener('keydown', this.boundKeyHandler);
      this.boundKeyHandler = null;
    }
    if (this.view && this.boundRelocateHandler) {
      this.view.removeEventListener('relocate', this.boundRelocateHandler);
      this.boundRelocateHandler = null;
    }

    if (this.relocateDebounceTimer) {
      clearTimeout(this.relocateDebounceTimer);
      this.relocateDebounceTimer = null;
    }
    this.pendingLocation = null;
    this.onPageChangeCallback = undefined;

    if (this.view) {
      this.view.close();
      this.view.remove();
      this.view = null;
    }
    if (this.wrapper) {
      this.wrapper.remove();
      this.wrapper = null;
    }
    this.totalLocations = 0;
    this.currentLocation = 1;
    this.cachedToc = null;
    super.destroy();
  }
}
