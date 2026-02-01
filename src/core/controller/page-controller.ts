import type { ReaderNavigation } from '@/types';

/**
 * Events emitted by the page controller
 */
export interface PageControllerEvents {
  pageChange: (page: number, total: number) => void;
}

/**
 * Unified page controller for navigation
 * Handles keyboard and touch input across all formats
 */
export class PageController implements ReaderNavigation {
  private _currentPage = 1;
  private _totalPages = 1;
  private _container: HTMLElement | null = null;
  private _onPageChange?: (page: number, total: number) => void;
  private _renderPage?: (page: number) => Promise<void>;

  // Touch handling state
  private touchStartX = 0;
  private touchStartY = 0;
  private touchStartTime = 0;
  private readonly SWIPE_THRESHOLD = 50;
  private readonly SWIPE_TIME_LIMIT = 300;

  // Bound handlers for cleanup
  private boundKeyHandler: (e: KeyboardEvent) => void;
  private boundTouchStart: (e: TouchEvent) => void;
  private boundTouchEnd: (e: TouchEvent) => void;

  constructor() {
    this.boundKeyHandler = this.handleKeyDown.bind(this);
    this.boundTouchStart = this.handleTouchStart.bind(this);
    this.boundTouchEnd = this.handleTouchEnd.bind(this);
  }

  get currentPage(): number {
    return this._currentPage;
  }

  get totalPages(): number {
    return this._totalPages;
  }

  /**
   * Initialize the controller with a container element
   */
  init(
    container: HTMLElement,
    options: {
      totalPages: number;
      onPageChange?: (page: number, total: number) => void;
      renderPage?: (page: number) => Promise<void>;
    }
  ): void {
    this._container = container;
    this._totalPages = options.totalPages;
    this._onPageChange = options.onPageChange;
    this._renderPage = options.renderPage;

    // Set up keyboard navigation
    document.addEventListener('keydown', this.boundKeyHandler);

    // Set up touch navigation
    container.addEventListener('touchstart', this.boundTouchStart, { passive: true });
    container.addEventListener('touchend', this.boundTouchEnd, { passive: true });

    // Make container focusable for keyboard events
    if (!container.hasAttribute('tabindex')) {
      container.setAttribute('tabindex', '0');
    }
  }

  /**
   * Update total pages (e.g., after loading more content)
   */
  setTotalPages(total: number): void {
    this._totalPages = total;
  }

  /**
   * Clean up event listeners
   */
  destroy(): void {
    document.removeEventListener('keydown', this.boundKeyHandler);
    if (this._container) {
      this._container.removeEventListener('touchstart', this.boundTouchStart);
      this._container.removeEventListener('touchend', this.boundTouchEnd);
    }
    this._container = null;
  }

  /**
   * Navigate to next page
   */
  async next(): Promise<void> {
    if (this._currentPage < this._totalPages) {
      await this.goTo(this._currentPage + 1);
    }
  }

  /**
   * Navigate to previous page
   */
  async prev(): Promise<void> {
    if (this._currentPage > 1) {
      await this.goTo(this._currentPage - 1);
    }
  }

  /**
   * Navigate to specific page
   */
  async goTo(page: number): Promise<void> {
    const targetPage = Math.max(1, Math.min(page, this._totalPages));
    if (targetPage === this._currentPage) return;

    this._currentPage = targetPage;

    if (this._renderPage) {
      await this._renderPage(targetPage);
    }

    if (this._onPageChange) {
      this._onPageChange(targetPage, this._totalPages);
    }
  }

  /**
   * Handle keyboard navigation
   */
  private handleKeyDown(e: KeyboardEvent): void {
    // Ignore if user is typing in an input
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    ) {
      return;
    }

    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
      case ' ':
        e.preventDefault();
        this.next();
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        this.prev();
        break;
      case 'Home':
        e.preventDefault();
        this.goTo(1);
        break;
      case 'End':
        e.preventDefault();
        this.goTo(this._totalPages);
        break;
    }
  }

  /**
   * Handle touch start for swipe detection
   */
  private handleTouchStart(e: TouchEvent): void {
    const touch = e.touches[0];
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
    this.touchStartTime = Date.now();
  }

  /**
   * Handle touch end for swipe detection
   */
  private handleTouchEnd(e: TouchEvent): void {
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - this.touchStartX;
    const deltaY = touch.clientY - this.touchStartY;
    const deltaTime = Date.now() - this.touchStartTime;

    // Check if this is a valid swipe
    if (deltaTime > this.SWIPE_TIME_LIMIT) return;
    if (Math.abs(deltaY) > Math.abs(deltaX)) return; // Vertical scroll
    if (Math.abs(deltaX) < this.SWIPE_THRESHOLD) return;

    if (deltaX > 0) {
      // Swipe right = previous page
      this.prev();
    } else {
      // Swipe left = next page
      this.next();
    }
  }
}
