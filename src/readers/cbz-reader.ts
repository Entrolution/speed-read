import { BaseReader } from './base-reader';
import type {
  ZipEntry,
  WorkerResponse,
  ParseResponse,
  ExtractResponse,
} from '../workers/zip-extractor.worker';
import type { TocItem, FitMode, LayoutMode } from '@/types';
import { clampZoom } from '@/core/utils';

/**
 * CBZ (Comic Book ZIP) reader with lazy loading and Web Worker extraction
 *
 * - Parses ZIP metadata upfront (fast)
 * - Extracts images on-demand in Web Worker
 * - LRU cache prevents memory bloat
 * - Preloads adjacent pages for smooth navigation
 */
export class CbzReader extends BaseReader {
  private worker: Worker | null = null;
  private entries: ZipEntry[] = [];
  private currentImage: HTMLImageElement | null = null;
  private secondImage: HTMLImageElement | null = null; // For 2-page layout
  private currentPageNum = 1;
  private onPageChangeCallback?: (page: number, total: number) => void;

  // LRU cache for extracted images (uses lastAccess timestamp for O(1) updates)
  // Size of 10 balances memory usage vs. avoiding re-extractions during navigation
  private readonly maxCacheSize = 10;
  private imageCache: Map<number, { blob: Blob; url: string; lastAccess: number }> = new Map();

  // Track pending extractions to avoid duplicates
  private pendingExtractions: Map<number, Promise<Blob>> = new Map();

  // Zoom and layout state
  private zoomLevel = 1.0;
  private fitMode: FitMode = 'page';
  private layoutMode: LayoutMode = '1-page';
  private cachedToc: TocItem[] | null = null;
  private pagesContainer: HTMLDivElement | null = null;

  async load(data: ArrayBuffer, container: HTMLElement): Promise<void> {
    // Create worker
    this.worker = new Worker(
      new URL('../workers/zip-extractor.worker.ts', import.meta.url),
      { type: 'module' }
    );

    // Parse ZIP metadata (doesn't extract images yet)
    this.entries = await this.parseZip(data);

    if (this.entries.length === 0) {
      throw new Error('No images found in CBZ file');
    }

    // Create container for pages
    // Use inline-flex with margin:auto for centering that doesn't clip overflow
    this.pagesContainer = document.createElement('div');
    this.pagesContainer.className = 'speed-reader-cbz-pages';
    this.pagesContainer.style.cssText = `
      display: inline-flex;
      align-items: flex-start;
      gap: var(--speed-reader-page-gap, 20px);
      padding: 10px;
      box-sizing: border-box;
      margin: auto;
    `;

    // Create image elements with decoding="async" for non-blocking decode
    this.currentImage = document.createElement('img');
    this.currentImage.className = 'speed-reader-cbz-image';
    this.currentImage.style.cssText = 'max-width: 100%; max-height: 100%; object-fit: contain; display: block; flex-shrink: 0;';
    this.currentImage.decoding = 'async';

    this.secondImage = document.createElement('img');
    this.secondImage.className = 'speed-reader-cbz-image';
    this.secondImage.style.cssText = 'max-width: 100%; max-height: 100%; object-fit: contain; display: none; flex-shrink: 0;';
    this.secondImage.decoding = 'async';

    // Clear container and add images
    container.innerHTML = '';
    this.pagesContainer.appendChild(this.currentImage);
    this.pagesContainer.appendChild(this.secondImage);
    container.appendChild(this.pagesContainer);

    this.container = container;
    this.isLoaded = true;

    // Render first page
    await this.renderPage(1);

    // Initialize controller
    this.initController(container, this.onPageChangeCallback);

    // Preload adjacent pages in background
    this.preloadAdjacent(1);
  }

  /**
   * Parse ZIP in worker - returns metadata only, no extraction
   */
  private parseZip(data: ArrayBuffer): Promise<ZipEntry[]> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Worker not initialized'));
        return;
      }

      const handler = (e: MessageEvent<WorkerResponse>) => {
        this.worker?.removeEventListener('message', handler);

        if (e.data.type === 'parsed') {
          resolve((e.data as ParseResponse).entries);
        } else if (e.data.type === 'error') {
          reject(new Error(e.data.message));
        }
      };

      this.worker.addEventListener('message', handler);
      this.worker.postMessage({ type: 'parse', data }, [data]);
    });
  }

  /**
   * Extract a single image from the ZIP via worker
   */
  private extractImage(index: number): Promise<Blob> {
    // Return cached if available (update lastAccess for LRU)
    const cached = this.imageCache.get(index);
    if (cached) {
      cached.lastAccess = performance.now();
      return Promise.resolve(cached.blob);
    }

    // Return pending extraction if already in progress
    const pending = this.pendingExtractions.get(index);
    if (pending) {
      return pending;
    }

    // Start new extraction
    const extraction = new Promise<Blob>((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Worker not initialized'));
        return;
      }

      const handler = (e: MessageEvent<WorkerResponse>) => {
        if (e.data.type === 'extracted' && (e.data as ExtractResponse).index === index) {
          this.worker?.removeEventListener('message', handler);
          this.pendingExtractions.delete(index);

          const response = e.data as ExtractResponse;
          const blob = new Blob([response.data]);

          // Add to cache
          this.addToCache(index, blob);

          resolve(blob);
        } else if (e.data.type === 'error') {
          this.worker?.removeEventListener('message', handler);
          this.pendingExtractions.delete(index);
          reject(new Error(e.data.message));
        }
      };

      this.worker.addEventListener('message', handler);
      this.worker.postMessage({ type: 'extract', index });
    });

    this.pendingExtractions.set(index, extraction);
    return extraction;
  }

  /**
   * Add image to LRU cache, evicting oldest entry if needed
   */
  private addToCache(index: number, blob: Blob): void {
    // Evict oldest if at capacity
    if (this.imageCache.size >= this.maxCacheSize) {
      let oldestIndex = -1;
      let oldestTime = Infinity;

      for (const [idx, entry] of this.imageCache) {
        if (entry.lastAccess < oldestTime) {
          oldestTime = entry.lastAccess;
          oldestIndex = idx;
        }
      }

      if (oldestIndex !== -1) {
        const evicted = this.imageCache.get(oldestIndex);
        if (evicted) {
          URL.revokeObjectURL(evicted.url);
          this.imageCache.delete(oldestIndex);
        }
      }
    }

    // Create Object URL and cache
    const url = URL.createObjectURL(blob);
    this.imageCache.set(index, { blob, url, lastAccess: performance.now() });
  }

  /**
   * Preload adjacent pages in background
   */
  private preloadAdjacent(currentPage: number): void {
    const pagesToPreload = [currentPage + 1, currentPage - 1, currentPage + 2];

    for (const page of pagesToPreload) {
      const index = page - 1;
      if (index >= 0 && index < this.entries.length) {
        // Fire and forget - preload in background
        this.extractImage(index).catch(() => {
          // Ignore preload errors
        });
      }
    }
  }

  /**
   * Set page change callback
   */
  setOnPageChange(callback: (page: number, total: number) => void): void {
    this.onPageChangeCallback = callback;
  }

  protected getPageCount(): number {
    return this.entries.length;
  }

  protected async renderPage(pageNum: number): Promise<void> {
    if (!this.currentImage || this.entries.length === 0) return;

    pageNum = Math.max(1, Math.min(pageNum, this.entries.length));

    // In 2-page mode, ensure we start on an odd page (left side)
    if (this.layoutMode === '2-page' && pageNum % 2 === 0 && pageNum > 1) {
      pageNum = pageNum - 1;
    }

    this.currentPageNum = pageNum;
    const index = pageNum - 1;

    // Extract and display first image
    await this.extractImage(index);

    // Check if component was destroyed during extraction
    if (!this.currentImage) return;

    const cached = this.imageCache.get(index);

    if (!cached) {
      // Component may have been destroyed and cache cleared - silently return
      return;
    }

    // Apply zoom styling
    this.applyZoomStyles(this.currentImage);

    // Wait for image to load
    await new Promise<void>((resolve, reject) => {
      this.currentImage!.onload = () => resolve();
      this.currentImage!.onerror = () => reject(new Error(`Failed to load image: ${this.entries[index].name}`));
      this.currentImage!.src = cached.url;
    });

    // Handle second page for 2-page layout
    if (this.layoutMode === '2-page' && this.secondImage) {
      const nextIndex = index + 1;
      if (nextIndex < this.entries.length) {
        await this.extractImage(nextIndex);

        // Check if component was destroyed during extraction
        if (!this.secondImage) return;

        const cached2 = this.imageCache.get(nextIndex);

        if (cached2) {
          this.applyZoomStyles(this.secondImage);
          this.secondImage.style.display = 'block';

          await new Promise<void>((resolve, reject) => {
            this.secondImage!.onload = () => resolve();
            this.secondImage!.onerror = () => reject(new Error(`Failed to load image: ${this.entries[nextIndex].name}`));
            this.secondImage!.src = cached2.url;
          });
        }
      } else {
        this.secondImage.style.display = 'none';
      }
    } else if (this.secondImage) {
      this.secondImage.style.display = 'none';
    }

    // Fire callback
    if (this.onPageChangeCallback) {
      this.onPageChangeCallback(pageNum, this.getPageCount());
    }

    // Preload adjacent pages
    this.preloadAdjacent(pageNum);
  }

  /**
   * Apply zoom styles to an image element
   * Uses actual width/height instead of transforms to enable native scrolling
   */
  private applyZoomStyles(img: HTMLImageElement): void {
    // Reset all zoom-related styles first
    img.style.transform = '';
    img.style.width = '';
    img.style.height = '';
    img.style.minWidth = '';
    img.style.minHeight = '';

    if (this.fitMode === 'none') {
      // Manual zoom - use percentage width based on zoom level
      // This creates actual overflow for scrolling
      const zoomPercent = this.zoomLevel * 100;
      img.style.maxWidth = 'none';
      img.style.maxHeight = 'none';
      img.style.width = `${zoomPercent}%`;
      img.style.height = 'auto';
      img.style.objectFit = 'contain';
    } else if (this.fitMode === 'width') {
      // Fit to width - image fills container width
      img.style.maxWidth = '100%';
      img.style.maxHeight = 'none';
      img.style.width = '100%';
      img.style.height = 'auto';
      img.style.objectFit = 'contain';
    } else {
      // 'page' mode - fit within container
      img.style.maxWidth = '100%';
      img.style.maxHeight = '100%';
      img.style.width = 'auto';
      img.style.height = 'auto';
      img.style.objectFit = 'contain';
    }
  }

  /**
   * Get pseudo table of contents from folder structure
   * Groups images by folder name
   */
  getToc(): TocItem[] {
    if (this.cachedToc) {
      return this.cachedToc;
    }

    const folders = new Map<string, { startPage: number; count: number }>();
    let idCounter = 0;

    this.entries.forEach((entry, index) => {
      // Extract folder name from path
      const parts = entry.name.split('/');
      const folder = parts.length > 1 ? parts[parts.length - 2] : 'Root';

      if (!folders.has(folder)) {
        folders.set(folder, { startPage: index + 1, count: 1 });
      } else {
        folders.get(folder)!.count++;
      }
    });

    // Convert folders to TOC items
    this.cachedToc = Array.from(folders.entries()).map(([name, info]) => ({
      id: `cbz-toc-${idCounter++}`,
      label: `${name} (${info.count} pages)`,
      page: info.startPage,
      level: 0,
    }));

    return this.cachedToc;
  }

  /**
   * Navigate to a TOC item
   */
  async goToTocItem(item: TocItem): Promise<void> {
    if (item.page) {
      await this.pageController.goTo(item.page);
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
    this.zoomLevel = clampZoom(level);
    this.fitMode = 'none';
    // Re-render current page
    this.renderPage(this.currentPageNum);
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
    // Re-render current page
    this.renderPage(this.currentPageNum);
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
    // Re-render current page
    this.renderPage(this.currentPageNum);
  }

  destroy(): void {
    // Terminate worker
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    // Clean up all cached Object URLs
    for (const [, cached] of this.imageCache) {
      URL.revokeObjectURL(cached.url);
    }
    this.imageCache.clear();
    this.pendingExtractions.clear();

    this.entries = [];
    this.currentImage = null;
    this.secondImage = null;
    this.pagesContainer = null;
    this.cachedToc = null;
    this.onPageChangeCallback = undefined;

    super.destroy();
  }
}
