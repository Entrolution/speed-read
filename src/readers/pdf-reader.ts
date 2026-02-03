import { BaseVisualReader } from './base-visual-reader';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import type { TocItem } from '@/types';

interface PdfOutlineItem {
  title: string;
  dest: string | unknown[] | null;
  items?: PdfOutlineItem[];
}

/**
 * PDF reader using pdf.js with web worker support
 */
export class PdfReader extends BaseVisualReader {
  private pdfDoc: PDFDocumentProxy | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private canvas2: HTMLCanvasElement | null = null; // For 2-page layout
  private ctx: CanvasRenderingContext2D | null = null;
  private ctx2: CanvasRenderingContext2D | null = null;
  private scale = 1.5;
  private currentRenderTask: RenderTask | null = null;
  private currentRenderTask2: RenderTask | null = null;
  private onPageChangeCallback?: (page: number, total: number) => void;
  private pagesContainer: HTMLDivElement | null = null;

  // Cache for page viewport dimensions (avoids repeated getViewport calls)
  // Limited to 50 entries to prevent unbounded memory growth with large PDFs
  private static readonly MAX_VIEWPORT_CACHE_SIZE = 50;
  private viewportCache: Map<number, { width: number; height: number }> = new Map();

  async load(data: ArrayBuffer, container: HTMLElement): Promise<void> {
    // Dynamic import pdf.js
    const pdfjsLib = await import('pdfjs-dist');

    // Set up the worker from jsdelivr (matches npm package version)
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

    // Load the PDF document
    const loadingTask = pdfjsLib.getDocument({ data });
    this.pdfDoc = await loadingTask.promise;

    // Create container for pages
    this.pagesContainer = document.createElement('div');
    this.pagesContainer.className = 'speed-reader-pdf-pages';
    this.pagesContainer.style.cssText = 'display: flex; justify-content: center; gap: var(--speed-reader-page-gap, 20px);';

    // Create canvas for rendering
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'speed-reader-pdf-canvas';
    this.ctx = this.canvas.getContext('2d');

    // Create second canvas for 2-page layout
    this.canvas2 = document.createElement('canvas');
    this.canvas2.className = 'speed-reader-pdf-canvas';
    this.canvas2.style.display = 'none';
    this.ctx2 = this.canvas2.getContext('2d');

    // Clear container and add canvases
    container.innerHTML = '';
    this.pagesContainer.appendChild(this.canvas);
    this.pagesContainer.appendChild(this.canvas2);
    container.appendChild(this.pagesContainer);

    this.container = container;
    this.isLoaded = true;

    // Render first page
    await this.renderPage(1);

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
    return this.pdfDoc?.numPages ?? 0;
  }

  protected async renderPage(pageNum: number): Promise<void> {
    if (!this.pdfDoc || !this.canvas || !this.ctx) return;

    // Cancel any in-progress renders
    if (this.currentRenderTask) {
      this.currentRenderTask.cancel();
      this.currentRenderTask = null;
    }
    if (this.currentRenderTask2) {
      this.currentRenderTask2.cancel();
      this.currentRenderTask2 = null;
    }

    // Ensure page number is valid
    pageNum = Math.max(1, Math.min(pageNum, this.pdfDoc.numPages));

    // In 2-page mode, ensure we start on an odd page (left side)
    if (this.layoutMode === '2-page' && pageNum % 2 === 0 && pageNum > 1) {
      pageNum = pageNum - 1;
    }

    // Determine if we need to render two pages
    const is2PageMode = this.layoutMode === '2-page' && this.canvas2 && this.ctx2;
    const nextPageNum = pageNum + 1;
    const hasSecondPage = is2PageMode && nextPageNum <= this.pdfDoc.numPages;

    // Fetch pages in parallel for 2-page mode
    const pagePromises: Promise<Awaited<ReturnType<PDFDocumentProxy['getPage']>>>[] = [
      this.pdfDoc.getPage(pageNum),
    ];
    if (hasSecondPage) {
      pagePromises.push(this.pdfDoc.getPage(nextPageNum));
    }

    const pages = await Promise.all(pagePromises);
    const page = pages[0];
    const page2 = pages[1];

    // Check if component was destroyed during async operation
    if (!this.canvas || !this.ctx) return;

    // Calculate scale based on fit mode and zoom level
    this.scale = this.calculateScale(page);

    // HiDPI support: render at device pixel ratio for sharp display
    const dpr = window.devicePixelRatio || 1;
    const viewport = page.getViewport({ scale: this.scale * dpr });

    // Set canvas backing store dimensions (actual pixels)
    this.canvas.width = viewport.width;
    this.canvas.height = viewport.height;
    // Set CSS dimensions (logical pixels)
    this.canvas.style.width = `${viewport.width / dpr}px`;
    this.canvas.style.height = `${viewport.height / dpr}px`;
    this.canvas.style.display = 'block';

    // Prepare render tasks
    this.currentRenderTask = page.render({
      canvasContext: this.ctx,
      viewport: viewport,
    });

    // Set up second page render task if applicable
    if (hasSecondPage && page2 && this.canvas2 && this.ctx2) {
      const viewport2 = page2.getViewport({ scale: this.scale * dpr });
      this.canvas2.width = viewport2.width;
      this.canvas2.height = viewport2.height;
      this.canvas2.style.width = `${viewport2.width / dpr}px`;
      this.canvas2.style.height = `${viewport2.height / dpr}px`;
      this.canvas2.style.display = 'block';

      this.currentRenderTask2 = page2.render({
        canvasContext: this.ctx2,
        viewport: viewport2,
      });
    } else if (this.canvas2) {
      this.canvas2.style.display = 'none';
    }

    // Execute renders in parallel
    const renderPromises: Promise<void>[] = [
      this.currentRenderTask.promise.then(() => {
        this.currentRenderTask = null;
      }).catch((err) => {
        this.currentRenderTask = null;
        if ((err as Error).name !== 'RenderingCancelledException') {
          throw err;
        }
      }),
    ];

    if (this.currentRenderTask2) {
      renderPromises.push(
        this.currentRenderTask2.promise.then(() => {
          this.currentRenderTask2 = null;
        }).catch((err) => {
          this.currentRenderTask2 = null;
          if ((err as Error).name !== 'RenderingCancelledException') {
            throw err;
          }
        })
      );
    }

    await Promise.all(renderPromises);

    // Fire callback
    if (this.onPageChangeCallback) {
      this.onPageChangeCallback(pageNum, this.getPageCount());
    }
  }

  /**
   * Calculate render scale based on fit mode and zoom level
   * Uses cached viewport dimensions to avoid redundant getViewport calls
   */
  private calculateScale(page: Awaited<ReturnType<PDFDocumentProxy['getPage']>>): number {
    if (!this.container) return this.zoomLevel;

    // Get cached dimensions or compute and cache them
    const pageNum = page.pageNumber;
    let dimensions = this.viewportCache.get(pageNum);
    if (!dimensions) {
      const defaultViewport = page.getViewport({ scale: 1 });
      dimensions = { width: defaultViewport.width, height: defaultViewport.height };
      // Evict oldest entry if cache is full
      if (this.viewportCache.size >= PdfReader.MAX_VIEWPORT_CACHE_SIZE) {
        const firstKey = this.viewportCache.keys().next().value;
        if (firstKey !== undefined) this.viewportCache.delete(firstKey);
      }
      this.viewportCache.set(pageNum, dimensions);
    }

    const containerWidth = this.container.clientWidth;
    const containerHeight = this.container.clientHeight;

    // In 2-page mode, each page gets half the width (minus gap)
    const pageGap = 20;
    const availableWidth = this.layoutMode === '2-page'
      ? (containerWidth - pageGap) / 2
      : containerWidth;

    let baseScale = 1.0;

    switch (this.fitMode) {
      case 'width':
        baseScale = availableWidth / dimensions.width;
        break;
      case 'page': {
        const scaleX = availableWidth / dimensions.width;
        const scaleY = containerHeight / dimensions.height;
        baseScale = Math.min(scaleX, scaleY);
        break;
      }
      case 'none':
        baseScale = 1.0;
        break;
    }

    // Apply manual zoom on top of fit scale
    return baseScale * this.zoomLevel;
  }

  /**
   * Get table of contents from PDF outline
   */
  getToc(): TocItem[] {
    if (this.cachedToc) {
      return this.cachedToc;
    }

    // TOC is fetched asynchronously, so we trigger the fetch
    // and return empty initially. The component should call this
    // again after the async fetch completes.
    this.fetchToc();
    return this.cachedToc ?? [];
  }

  /**
   * Fetch TOC asynchronously
   */
  private async fetchToc(): Promise<void> {
    if (!this.pdfDoc || this.cachedToc) return;

    try {
      const outline = await this.pdfDoc.getOutline() as PdfOutlineItem[] | null;
      if (!outline) {
        this.cachedToc = [];
        return;
      }

      let idCounter = 0;
      const convertOutlineItem = async (item: PdfOutlineItem, level: number): Promise<TocItem> => {
        const tocItem: TocItem = {
          id: `pdf-toc-${idCounter++}`,
          label: item.title,
          level,
        };

        // Resolve destination to page number
        if (item.dest) {
          try {
            let destArray: unknown[];
            if (typeof item.dest === 'string') {
              const destRef = await this.pdfDoc!.getDestination(item.dest);
              destArray = destRef ?? [];
            } else {
              destArray = item.dest as unknown[];
            }

            if (destArray.length > 0) {
              const pageIndex = await this.pdfDoc!.getPageIndex(destArray[0] as { num: number; gen: number });
              tocItem.page = pageIndex + 1;
            }
          } catch {
            // Ignore destination resolution errors
          }
        }

        if (item.items && item.items.length > 0) {
          tocItem.children = await Promise.all(
            item.items.map(sub => convertOutlineItem(sub, level + 1))
          );
        }

        return tocItem;
      };

      this.cachedToc = await Promise.all(
        outline.map(item => convertOutlineItem(item, 0))
      );
    } catch {
      this.cachedToc = [];
    }
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
   * Re-render when display settings change
   */
  protected onDisplayChange(): void {
    const currentPage = this.pageController.currentPage;
    this.renderPage(currentPage);
  }

  override destroy(): void {
    if (this.currentRenderTask) {
      this.currentRenderTask.cancel();
      this.currentRenderTask = null;
    }
    if (this.currentRenderTask2) {
      this.currentRenderTask2.cancel();
      this.currentRenderTask2 = null;
    }
    if (this.pdfDoc) {
      this.pdfDoc.destroy();
      this.pdfDoc = null;
    }
    this.canvas = null;
    this.canvas2 = null;
    this.ctx = null;
    this.ctx2 = null;
    this.pagesContainer = null;
    this.viewportCache.clear();
    super.destroy();
  }
}
