import { BaseReader } from './base-reader';
import type { TocItem, FitMode, LayoutMode } from '@/types';
import { clampZoom } from '@/core/utils';

/**
 * Base class for visual document readers (PDF, CBZ, EPUB)
 * Provides common zoom, fit mode, layout mode, and TOC state management
 */
export abstract class BaseVisualReader extends BaseReader {
  // Zoom and layout state
  protected zoomLevel = 1.0;
  protected fitMode: FitMode = 'page';
  protected layoutMode: LayoutMode = '1-page';
  protected cachedToc: TocItem[] | null = null;

  /**
   * Called when display settings (zoom, fit, layout) change
   * Subclasses should re-render the current view
   */
  protected abstract onDisplayChange(): void;

  /**
   * Get current zoom level
   */
  getZoom(): number {
    return this.zoomLevel;
  }

  /**
   * Set zoom level (switches to manual zoom mode)
   */
  setZoom(level: number): void {
    this.zoomLevel = clampZoom(level);
    this.fitMode = 'none';
    this.onDisplayChange();
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
    this.onDisplayChange();
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
    this.onDisplayChange();
  }

  /**
   * Get table of contents
   * Subclasses should override to provide format-specific TOC
   */
  getToc(): TocItem[] {
    return this.cachedToc ?? [];
  }

  /**
   * Navigate to a TOC item
   * Subclasses should override for format-specific navigation
   */
  abstract goToTocItem(item: TocItem): Promise<void>;

  /**
   * Clean up resources
   */
  override destroy(): void {
    this.cachedToc = null;
    super.destroy();
  }
}
