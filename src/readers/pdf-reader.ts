import { BaseReader } from './base-reader';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

/**
 * PDF reader using pdf.js with web worker support
 */
export class PdfReader extends BaseReader {
  private pdfDoc: PDFDocumentProxy | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private scale = 1.5;
  private currentRenderTask: RenderTask | null = null;
  private onPageChangeCallback?: (page: number, total: number) => void;

  async load(data: ArrayBuffer, container: HTMLElement): Promise<void> {
    // Dynamic import pdf.js
    const pdfjsLib = await import('pdfjs-dist');

    // Set up the worker from jsdelivr (matches npm package version)
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

    // Load the PDF document
    const loadingTask = pdfjsLib.getDocument({ data });
    this.pdfDoc = await loadingTask.promise;

    // Create canvas for rendering
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'speed-reader-pdf-canvas';
    this.ctx = this.canvas.getContext('2d');

    // Clear container and add canvas
    container.innerHTML = '';
    container.appendChild(this.canvas);

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

    // Cancel any in-progress render
    if (this.currentRenderTask) {
      this.currentRenderTask.cancel();
      this.currentRenderTask = null;
    }

    // Ensure page number is valid
    pageNum = Math.max(1, Math.min(pageNum, this.pdfDoc.numPages));

    // Get the page
    const page = await this.pdfDoc.getPage(pageNum);

    // Calculate scale to fit container (both width and height)
    if (this.container) {
      const containerWidth = this.container.clientWidth;
      const containerHeight = this.container.clientHeight;
      const defaultViewport = page.getViewport({ scale: 1 });

      // Calculate scale to fit both dimensions
      const scaleX = containerWidth / defaultViewport.width;
      const scaleY = containerHeight / defaultViewport.height;
      this.scale = Math.min(scaleX, scaleY, 2); // Cap at 2x for quality
    }

    const viewport = page.getViewport({ scale: this.scale });

    // Set canvas dimensions
    this.canvas.width = viewport.width;
    this.canvas.height = viewport.height;
    this.canvas.style.display = 'block';
    this.canvas.style.margin = '0 auto';

    // Render the page
    this.currentRenderTask = page.render({
      canvasContext: this.ctx,
      viewport: viewport,
    });

    try {
      await this.currentRenderTask.promise;
    } catch (err) {
      // Ignore cancellation errors
      if ((err as Error).name !== 'RenderingCancelledException') {
        throw err;
      }
    }

    this.currentRenderTask = null;

    // Fire callback
    if (this.onPageChangeCallback) {
      this.onPageChangeCallback(pageNum, this.getPageCount());
    }
  }

  destroy(): void {
    if (this.currentRenderTask) {
      this.currentRenderTask.cancel();
      this.currentRenderTask = null;
    }
    if (this.pdfDoc) {
      this.pdfDoc.destroy();
      this.pdfDoc = null;
    }
    this.canvas = null;
    this.ctx = null;
    super.destroy();
  }
}
