import type { FitMode } from '@/types';

/**
 * Manages zoom state and operations
 * Zoom levels are clamped between 0.5 (50%) and 3.0 (300%)
 */
export class ZoomController {
  private level = 1.0;
  private fit: FitMode = 'page';
  private onChange?: (level: number, fitMode: FitMode) => void;

  static readonly MIN_ZOOM = 0.5;
  static readonly MAX_ZOOM = 3.0;
  static readonly ZOOM_STEP = 0.1;

  /**
   * Set callback for zoom changes
   */
  setOnChange(callback: (level: number, fitMode: FitMode) => void): void {
    this.onChange = callback;
  }

  /**
   * Get current zoom level
   */
  getLevel(): number {
    return this.level;
  }

  /**
   * Set zoom level (clamped to valid range)
   */
  setLevel(level: number): void {
    const clamped = Math.max(ZoomController.MIN_ZOOM, Math.min(ZoomController.MAX_ZOOM, level));
    if (clamped !== this.level) {
      this.level = clamped;
      this.fit = 'none'; // Exit fit mode when manually zooming
      this.notifyChange();
    }
  }

  /**
   * Get current fit mode
   */
  getFitMode(): FitMode {
    return this.fit;
  }

  /**
   * Set fit mode
   */
  setFitMode(mode: FitMode): void {
    if (mode !== this.fit) {
      this.fit = mode;
      this.notifyChange();
    }
  }

  /**
   * Zoom in by 10%
   */
  zoomIn(): void {
    this.setLevel(this.level + ZoomController.ZOOM_STEP);
  }

  /**
   * Zoom out by 10%
   */
  zoomOut(): void {
    this.setLevel(this.level - ZoomController.ZOOM_STEP);
  }

  /**
   * Reset to 100% and fit-to-page mode
   */
  reset(): void {
    this.level = 1.0;
    this.fit = 'page';
    this.notifyChange();
  }

  /**
   * Check if can zoom in further
   */
  canZoomIn(): boolean {
    return this.level < ZoomController.MAX_ZOOM;
  }

  /**
   * Check if can zoom out further
   */
  canZoomOut(): boolean {
    return this.level > ZoomController.MIN_ZOOM;
  }

  private notifyChange(): void {
    this.onChange?.(this.level, this.fit);
  }
}
