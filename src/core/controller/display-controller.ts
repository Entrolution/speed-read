import type { FitMode, LayoutMode } from '@/types';

interface ScrollPosition {
  x: number;
  y: number;
}

/**
 * Manages display state including zoom, layout, and scroll position persistence
 * State is session-only (resets on page refresh or document change)
 */
export class DisplayController {
  private zoomLevel = 1.0;
  private fitMode: FitMode = 'page';
  private layout: LayoutMode = '1-page';
  private scrollPositions = new Map<number, ScrollPosition>();
  private onChange?: () => void;

  /**
   * Set callback for display changes
   */
  setOnChange(callback: () => void): void {
    this.onChange = callback;
  }

  /**
   * Get current zoom level
   */
  getZoomLevel(): number {
    return this.zoomLevel;
  }

  /**
   * Set zoom level
   */
  setZoomLevel(level: number): void {
    this.zoomLevel = level;
    this.notifyChange();
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
    this.notifyChange();
  }

  /**
   * Get current layout mode
   */
  getLayout(): LayoutMode {
    return this.layout;
  }

  /**
   * Set layout mode
   */
  setLayout(layout: LayoutMode): void {
    if (layout !== this.layout) {
      this.layout = layout;
      this.notifyChange();
    }
  }

  /**
   * Save scroll position for a page
   * Call before navigating away from a page
   */
  saveScrollPosition(page: number, container: HTMLElement): void {
    this.scrollPositions.set(page, {
      x: container.scrollLeft,
      y: container.scrollTop,
    });
  }

  /**
   * Restore scroll position for a page
   * Call after rendering a page
   */
  restoreScrollPosition(page: number, container: HTMLElement): void {
    const position = this.scrollPositions.get(page);
    if (position) {
      container.scrollLeft = position.x;
      container.scrollTop = position.y;
    } else {
      // Default to top-left for new pages
      container.scrollLeft = 0;
      container.scrollTop = 0;
    }
  }

  /**
   * Clear all saved scroll positions
   */
  clearScrollPositions(): void {
    this.scrollPositions.clear();
  }

  /**
   * Reset all display settings to defaults
   */
  reset(): void {
    this.zoomLevel = 1.0;
    this.fitMode = 'page';
    this.layout = '1-page';
    this.scrollPositions.clear();
    this.notifyChange();
  }

  private notifyChange(): void {
    this.onChange?.();
  }
}
