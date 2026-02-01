import { BaseReader } from './base-reader';
import type {
  ZipEntry,
  WorkerResponse,
  ParseResponse,
  ExtractResponse,
} from '../workers/zip-extractor.worker';

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
  private currentPageNum = 1;
  private onPageChangeCallback?: (page: number, total: number) => void;

  // LRU cache for extracted images
  private readonly maxCacheSize = 5;
  private imageCache: Map<number, { blob: Blob; url: string }> = new Map();
  private cacheOrder: number[] = [];

  // Track pending extractions to avoid duplicates
  private pendingExtractions: Map<number, Promise<Blob>> = new Map();

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

    // Create image element
    this.currentImage = document.createElement('img');
    this.currentImage.className = 'speed-reader-cbz-image';
    this.currentImage.style.cssText = 'max-width: 100%; max-height: 100%; object-fit: contain;';

    // Clear container and add image
    container.innerHTML = '';
    container.appendChild(this.currentImage);

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
    // Return cached if available
    const cached = this.imageCache.get(index);
    if (cached) {
      this.updateCacheOrder(index);
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
   * Add image to LRU cache, evicting old entries if needed
   */
  private addToCache(index: number, blob: Blob): void {
    // Evict if at capacity
    while (this.imageCache.size >= this.maxCacheSize && this.cacheOrder.length > 0) {
      const evictIndex = this.cacheOrder.shift()!;
      const evicted = this.imageCache.get(evictIndex);
      if (evicted) {
        URL.revokeObjectURL(evicted.url);
        this.imageCache.delete(evictIndex);
      }
    }

    // Create Object URL and cache
    const url = URL.createObjectURL(blob);
    this.imageCache.set(index, { blob, url });
    this.cacheOrder.push(index);
  }

  /**
   * Update LRU order - move to end (most recently used)
   */
  private updateCacheOrder(index: number): void {
    const pos = this.cacheOrder.indexOf(index);
    if (pos !== -1) {
      this.cacheOrder.splice(pos, 1);
      this.cacheOrder.push(index);
    }
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
    this.currentPageNum = pageNum;

    const index = pageNum - 1;

    // Extract image (from cache or worker)
    const blob = await this.extractImage(index);
    const cached = this.imageCache.get(index);

    if (!cached) {
      throw new Error('Image not in cache after extraction');
    }

    // Wait for image to load
    await new Promise<void>((resolve, reject) => {
      this.currentImage!.onload = () => resolve();
      this.currentImage!.onerror = () => reject(new Error(`Failed to load image: ${this.entries[index].name}`));
      this.currentImage!.src = cached.url;
    });

    // Fire callback
    if (this.onPageChangeCallback) {
      this.onPageChangeCallback(pageNum, this.getPageCount());
    }

    // Preload adjacent pages
    this.preloadAdjacent(pageNum);
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
    this.cacheOrder = [];
    this.pendingExtractions.clear();

    this.entries = [];
    this.currentImage = null;
    this.onPageChangeCallback = undefined;

    super.destroy();
  }
}
