import { LitElement, html, css, PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { ReaderEngine } from '@/core/engine';
import { ZoomController, DisplayController } from '@/core/controller';
import type { ReaderError, TocItem, FitMode, LayoutMode, FormatReader } from '@/types';
import type { TumblrReader } from '@/readers/tumblr-reader';

// Import UI components (registers custom elements)
import './ui/toolbar';
import './ui/toc-panel';

// Extended FormatReader interface with optional methods
interface ExtendedReader extends FormatReader {
  getToc?(): TocItem[];
  goToTocItem?(item: TocItem): Promise<void>;
  getZoom?(): number;
  setZoom?(level: number): void;
  getFitMode?(): FitMode;
  setFitMode?(mode: FitMode): void;
  getLayout?(): LayoutMode;
  setLayout?(layout: LayoutMode): void;
}

/**
 * Speed Reader Web Component
 *
 * @element speed-reader
 *
 * @attr {string} src - URL to the document file
 * @attr {string} manifest - URL to the chapters.json manifest
 * @attr {string} tumblr - Tumblr post URL to load
 * @attr {string} tumblr-proxy - Custom CORS proxy URL for Tumblr (appends encoded target URL)
 * @attr {boolean} locked - Lock to the specified src/manifest, disabling file uploads
 *
 * @fires error - Fired when an error occurs
 * @fires pagechange - Fired when page changes
 * @fires chapterchange - Fired when chapter changes (manifest mode)
 * @fires ready - Fired when document is ready
 *
 * @csspart container - The main container element
 * @csspart controls - The navigation controls
 *
 * @cssprop [--speed-reader-bg=#ffffff] - Background color
 * @cssprop [--speed-reader-text=#000000] - Text color
 * @cssprop [--speed-reader-accent=#0066cc] - Accent color for controls
 * @cssprop [--speed-reader-error-bg=#fff0f0] - Error background color
 * @cssprop [--speed-reader-error-text=#cc0000] - Error text color
 * @cssprop [--speed-reader-toc-width=280px] - TOC panel width
 * @cssprop [--speed-reader-page-gap=20px] - Gap between pages in 2-page layout
 */
@customElement('speed-reader')
export class SpeedReader extends LitElement {
  static override styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      min-height: 400px;
      position: relative;
      font-family: system-ui, -apple-system, sans-serif;
      background: var(--speed-reader-bg, #ffffff);
      color: var(--speed-reader-text, #000000);
    }

    /* Skip link for keyboard users */
    .skip-link {
      position: absolute;
      top: -40px;
      left: 0;
      background: var(--speed-reader-accent, #0066cc);
      color: white;
      padding: 0.5rem 1rem;
      z-index: 100;
      text-decoration: none;
      border-radius: 0 0 4px 0;
    }

    .skip-link:focus {
      top: 0;
    }

    .container {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    .reader-content {
      flex: 1;
      overflow: auto;
      position: relative;
      min-height: 0;
      touch-action: pan-x pan-y pinch-zoom;
      /* Enable momentum scrolling on iOS */
      -webkit-overflow-scrolling: touch;
    }

    /* Show scrollbars when content overflows */
    .reader-content.has-overflow {
      overflow: scroll;
    }

    /* Persistent scrollbar styling */
    .reader-content::-webkit-scrollbar {
      width: 12px;
      height: 12px;
    }

    .reader-content::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.05);
      border-radius: 6px;
    }

    .reader-content::-webkit-scrollbar-thumb {
      background: rgba(0, 0, 0, 0.2);
      border-radius: 6px;
      border: 2px solid transparent;
      background-clip: padding-box;
    }

    .reader-content::-webkit-scrollbar-thumb:hover {
      background: rgba(0, 0, 0, 0.3);
      background-clip: padding-box;
    }

    .reader-content:focus {
      outline: 2px solid var(--speed-reader-accent, #0066cc);
      outline-offset: -2px;
    }

    @media (prefers-color-scheme: dark) {
      .reader-content::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.05);
      }

      .reader-content::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        background-clip: padding-box;
      }

      .reader-content::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.3);
        background-clip: padding-box;
      }
    }

    /* Screen reader only - for live announcements */
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    /* High contrast mode support */
    @media (prefers-contrast: more) {
      .reader-content:focus {
        outline-width: 3px;
      }
    }

    /* Reduced motion support */
    @media (prefers-reduced-motion: reduce) {
      .speed-reader-spinner {
        animation: none;
        border-top-color: var(--speed-reader-accent, #0066cc);
        border-right-color: var(--speed-reader-accent, #0066cc);
      }
    }

    .speed-reader-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      gap: 1rem;
    }

    .speed-reader-spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #e0e0e0;
      border-top-color: var(--speed-reader-accent, #0066cc);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }

    .speed-reader-error {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      padding: 2rem;
      text-align: center;
      background: var(--speed-reader-error-bg, #fff0f0);
    }

    .speed-reader-error-icon {
      font-size: 3rem;
      margin-bottom: 1rem;
    }

    .speed-reader-error h2 {
      margin: 0 0 0.5rem;
      color: var(--speed-reader-error-text, #cc0000);
    }

    .speed-reader-error p {
      margin: 0;
      max-width: 400px;
      color: var(--speed-reader-text, #000000);
      opacity: 0.8;
    }

    /* EPUB styles */
    .reader-content :global(.epub-container) {
      height: 100%;
    }

    /* PDF styles */
    .speed-reader-pdf-canvas {
      display: block;
      margin: 0 auto;
    }

    /* CBZ styles */
    .speed-reader-cbz-image {
      display: block;
      margin: 0 auto;
    }

    /* Tumblr styles */
    .tumblr-post {
      max-width: 700px;
      margin: 0 auto;
      padding: 1.5rem;
      font-size: 1.1rem;
      line-height: 1.7;
    }

    .tumblr-header {
      width: 100%;
      max-height: 300px;
      object-fit: cover;
      border-radius: 8px;
      margin-bottom: 1.5rem;
    }

    .tumblr-title {
      font-size: 1.5rem;
      margin: 0 0 1rem;
      font-weight: 600;
    }

    .tumblr-content p {
      margin: 0 0 1em;
    }

    .tumblr-content h1,
    .tumblr-content h2 {
      margin: 1.5em 0 0.5em;
    }

    .tumblr-content img,
    .tumblr-image {
      max-width: 100%;
      height: auto;
      border-radius: 4px;
      margin: 1em 0;
    }

    .tumblr-reblog-trail {
      border-left: 3px solid var(--speed-reader-border-color, #ccc);
      margin-bottom: 1.5rem;
    }

    .tumblr-reblog-entry {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--speed-reader-border-color, #eee);
    }

    .tumblr-reblog-entry:last-child {
      border-bottom: none;
    }

    .tumblr-reblog-author {
      font-weight: 600;
      margin-bottom: 0.5rem;
      color: var(--speed-reader-accent, #0066cc);
    }

    .tumblr-reblog-author a {
      color: inherit;
      text-decoration: none;
    }

    .tumblr-reblog-author a:hover {
      text-decoration: underline;
    }

    .tumblr-author {
      font-weight: 600;
      margin-bottom: 0.75rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid var(--speed-reader-border-color, #eee);
    }

    .tumblr-author a {
      color: var(--speed-reader-accent, #0066cc);
      text-decoration: none;
    }

    .tumblr-author a:hover {
      text-decoration: underline;
    }

    .tumblr-tags {
      margin-top: 1.5rem;
      padding-top: 1rem;
      border-top: 1px solid var(--speed-reader-border-color, #eee);
      font-size: 0.9rem;
      color: var(--speed-reader-text, #000000);
      opacity: 0.7;
    }

    .tumblr-tag {
      margin-right: 0.5rem;
    }

    .tumblr-loading,
    .tumblr-error {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      gap: 1rem;
      text-align: center;
      padding: 2rem;
    }

    .tumblr-spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #e0e0e0;
      border-top-color: var(--speed-reader-accent, #0066cc);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    .tumblr-error-icon {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: var(--speed-reader-error-bg, #fff0f0);
      color: var(--speed-reader-error-text, #cc0000);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
      font-weight: bold;
    }

    .tumblr-error h2 {
      margin: 0;
      color: var(--speed-reader-error-text, #cc0000);
    }

    .tumblr-error p {
      margin: 0;
      opacity: 0.8;
      max-width: 400px;
    }

    .tumblr-retry-btn {
      margin-top: 1rem;
      padding: 0.5rem 1.5rem;
      background: var(--speed-reader-accent, #0066cc);
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 1rem;
    }

    .tumblr-retry-btn:hover {
      opacity: 0.9;
    }

    .tumblr-video,
    .tumblr-audio {
      padding: 1rem;
      background: var(--speed-reader-bg, #f5f5f5);
      border-radius: 4px;
      margin: 1em 0;
      font-style: italic;
      opacity: 0.8;
    }

    /* Tumblr controls - positioned at top right */
    .tumblr-controls {
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      z-index: 10;
    }

    .cache-info {
      font-size: 0.75rem;
      color: var(--speed-reader-text, #666);
      opacity: 0.8;
    }

    .clear-cache-btn {
      padding: 0.375rem 0.75rem;
      background: transparent;
      color: var(--speed-reader-text, #666);
      border: 1px solid var(--speed-reader-border, #ccc);
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.75rem;
    }

    .clear-cache-btn:hover:not(:disabled) {
      background: rgba(0, 0, 0, 0.05);
    }

    .clear-cache-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .export-btn {
      padding: 0.5rem 1rem;
      background: var(--speed-reader-accent, #0066cc);
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.875rem;
      min-width: 120px;
      text-align: center;
    }

    .export-btn:hover:not(:disabled) {
      opacity: 0.9;
    }

    .export-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `;

  /**
   * URL to the document file (EPUB, PDF, or CBZ)
   */
  @property({ type: String })
  src?: string;

  /**
   * URL to the chapters.json manifest for episodic content
   */
  @property({ type: String })
  manifest?: string;

  /**
   * Lock the reader to the specified src/manifest, preventing file uploads
   * When true, the loadFile() method will be disabled
   */
  @property({ type: Boolean, reflect: true })
  locked = false;

  /**
   * Tumblr post URL to load
   */
  @property({ type: String })
  tumblr?: string;

  /**
   * Custom CORS proxy URL for Tumblr (appends encoded target URL)
   */
  @property({ type: String, attribute: 'tumblr-proxy' })
  tumblrProxy?: string;

  @state()
  private currentPage = 0;

  @state()
  private totalPages = 0;

  @state()
  private currentChapter = 0;

  @state()
  private totalChapters = 0;

  @state()
  private isLoading = true;

  @state()
  private error: ReaderError | null = null;

  @state()
  private tocOpen = false;

  @state()
  private tocItems: TocItem[] = [];

  @state()
  private zoomLevel = 1.0;

  @state()
  private layoutMode: LayoutMode = '1-page';

  @state()
  private isTumblrMode = false;

  @state()
  private isExporting = false;

  @state()
  private exportProgress = '';

  @state()
  private cachedPostCount = 0;

  @state()
  private tumblrCanPrev = false;

  @state()
  private tumblrCanNext = false;

  private engine: ReaderEngine | null = null;
  private tumblrReader: TumblrReader | null = null;
  private contentRef: HTMLElement | null = null;
  private zoomController: ZoomController;
  private displayController: DisplayController;
  private boundKeyHandler: ((e: KeyboardEvent) => void) | null = null;
  private boundResizeHandler: (() => void) | null = null;
  private resizeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super();
    this.zoomController = new ZoomController();
    this.displayController = new DisplayController();

    // Sync zoom controller changes to component state
    this.zoomController.setOnChange((level) => {
      this.zoomLevel = level;
      this.applyZoomToReader();
    });

    this.displayController.setOnChange(() => {
      this.layoutMode = this.displayController.getLayout();
      this.applyLayoutToReader();
    });
  }

  override connectedCallback(): void {
    super.connectedCallback();

    // Set up keyboard shortcuts
    this.boundKeyHandler = this.handleKeyDown.bind(this);
    document.addEventListener('keydown', this.boundKeyHandler);

    // Set up resize handler for responsive layout
    this.boundResizeHandler = this.handleResize.bind(this);
    window.addEventListener('resize', this.boundResizeHandler);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.engine?.destroy();
    this.engine = null;
    this.tumblrReader?.destroy();
    this.tumblrReader = null;

    if (this.boundKeyHandler) {
      document.removeEventListener('keydown', this.boundKeyHandler);
      this.boundKeyHandler = null;
    }

    if (this.boundResizeHandler) {
      window.removeEventListener('resize', this.boundResizeHandler);
      this.boundResizeHandler = null;
    }

    if (this.resizeTimer) {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = null;
    }
  }

  override firstUpdated(): void {
    this.contentRef = this.renderRoot.querySelector('.reader-content') as HTMLElement;
    this.initReader();
  }

  override updated(changedProps: PropertyValues): void {
    // Re-initialize reader when src, manifest, or tumblr changes
    // Skip the very first update (handled by firstUpdated)
    const srcChanged = changedProps.has('src');
    const manifestChanged = changedProps.has('manifest');
    const tumblrChanged = changedProps.has('tumblr');

    if (srcChanged || manifestChanged || tumblrChanged) {
      // Get old values - if ALL were undefined, this is probably initial render
      const oldSrc = changedProps.get('src');
      const oldManifest = changedProps.get('manifest');
      const oldTumblr = changedProps.get('tumblr');

      // Re-init if: old value existed (changing from one source to another)
      // OR new value exists and we're changing TO it (dynamic attribute set)
      const shouldReinit =
        oldSrc !== undefined ||
        oldManifest !== undefined ||
        oldTumblr !== undefined ||
        (this.tumblr && tumblrChanged) ||
        (this.src && srcChanged) ||
        (this.manifest && manifestChanged);

      if (shouldReinit) {
        this.initReader();
      }
    }
  }

  private async initReader(): Promise<void> {
    if (!this.contentRef) return;
    if (!this.src && !this.manifest && !this.tumblr) return;

    this.isLoading = true;
    this.error = null;
    this.tocItems = [];
    this.tocOpen = false;
    this.isTumblrMode = false;

    // Reset controllers
    this.zoomController.reset();
    this.displayController.reset();

    // Clean up previous readers
    this.engine?.destroy();
    this.engine = null;
    this.tumblrReader?.destroy();
    this.tumblrReader = null;

    // Check if this is a Tumblr URL
    if (this.tumblr) {
      await this.loadTumblr(this.tumblr);
      return;
    }

    this.engine = new ReaderEngine();

    await this.engine.init(this.contentRef, {
      src: this.src,
      manifest: this.manifest,
      onError: (error) => {
        this.error = error;
        this.isLoading = false;
        this.dispatchEvent(new CustomEvent('error', { detail: error }));
      },
      onPageChange: (page, total) => {
        this.currentPage = page;
        this.totalPages = total;
        this.dispatchEvent(new CustomEvent('pagechange', { detail: { page, total } }));
      },
      onChapterChange: (chapter, total) => {
        this.currentChapter = chapter;
        this.totalChapters = total;
        this.dispatchEvent(new CustomEvent('chapterchange', { detail: { chapter, total } }));
      },
      onReady: () => {
        this.isLoading = false;
        const nav = this.engine?.getNavigation();
        if (nav) {
          this.currentPage = nav.currentPage;
          this.totalPages = nav.totalPages;
        }

        // Load TOC from reader
        this.loadToc();

        // Check overflow state
        requestAnimationFrame(() => {
          this.updateOverflowState();
        });

        this.dispatchEvent(new CustomEvent('ready'));
      },
    });
  }

  /**
   * Load a Tumblr post via CORS proxy
   */
  private async loadTumblr(url: string): Promise<void> {
    if (!this.contentRef) return;

    this.isTumblrMode = true;

    try {
      // Dynamically import TumblrReader
      const { TumblrReader } = await import('@/readers/tumblr-reader');
      this.tumblrReader = new TumblrReader();

      await this.tumblrReader.loadFromUrl(url, this.contentRef, {
        customProxy: this.tumblrProxy,
        onPageChange: (page, total) => {
          this.currentPage = page;
          this.totalPages = total;
          this.updateTumblrNavigation();
          this.updateCachedPostCount();
          this.dispatchEvent(new CustomEvent('pagechange', { detail: { page, total } }));
        },
      });

      this.isLoading = false;
      this.updateTumblrNavigation();
      this.updateCachedPostCount();

      // Check overflow state
      requestAnimationFrame(() => {
        this.updateOverflowState();
      });

      this.dispatchEvent(new CustomEvent('ready'));
    } catch (err) {
      this.error = {
        type: 'LOAD_FAILED',
        message: err instanceof Error ? err.message : 'Failed to load Tumblr post',
        retryable: true,
      };
      this.isLoading = false;
      this.dispatchEvent(new CustomEvent('error', { detail: this.error }));
    }
  }

  /**
   * Update Tumblr navigation state
   */
  private updateTumblrNavigation(): void {
    if (this.tumblrReader) {
      const nav = this.tumblrReader.hasNavigation();
      this.tumblrCanPrev = nav.canPrev;
      this.tumblrCanNext = nav.canNext;
    }
  }

  /**
   * Load TOC from the current reader
   */
  private loadToc(): void {
    const reader = this.getReader();
    if (reader?.getToc) {
      this.tocItems = reader.getToc();
    }
  }

  /**
   * Get the current format reader with extended methods
   */
  private getReader(): ExtendedReader | null {
    // Access the reader through the engine
    // The engine exposes the reader indirectly through its interface
    const engineAny = this.engine as unknown as { reader?: ExtendedReader };
    return engineAny?.reader ?? null;
  }

  /**
   * Apply zoom level to the current reader
   */
  private applyZoomToReader(): void {
    const reader = this.getReader();
    if (reader?.setZoom) {
      reader.setZoom(this.zoomLevel);
    }

    // Update overflow state after DOM updates
    requestAnimationFrame(() => {
      this.updateOverflowState();
    });
  }

  /**
   * Check if content overflows and update scrollbar visibility
   */
  private updateOverflowState(): void {
    if (!this.contentRef) return;

    const hasOverflow =
      this.contentRef.scrollWidth > this.contentRef.clientWidth ||
      this.contentRef.scrollHeight > this.contentRef.clientHeight;

    if (hasOverflow) {
      this.contentRef.classList.add('has-overflow');
    } else {
      this.contentRef.classList.remove('has-overflow');
    }
  }

  /**
   * Apply layout mode to the current reader
   */
  private applyLayoutToReader(): void {
    const reader = this.getReader();
    if (reader?.setLayout) {
      reader.setLayout(this.layoutMode);
    }

    // Update overflow state after DOM updates
    requestAnimationFrame(() => {
      this.updateOverflowState();
    });
  }

  /**
   * Handle keyboard shortcuts
   */
  private handleKeyDown(e: KeyboardEvent): void {
    // Ignore if typing in an input
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    ) {
      return;
    }

    const isMod = e.metaKey || e.ctrlKey;

    // Zoom shortcuts
    if (isMod && (e.key === '+' || e.key === '=')) {
      e.preventDefault();
      this.handleZoomIn();
    } else if (isMod && e.key === '-') {
      e.preventDefault();
      this.handleZoomOut();
    } else if (isMod && e.key === '0') {
      e.preventDefault();
      this.zoomController.reset();
    }
  }

  /**
   * Handle window resize for responsive layout (debounced)
   */
  private handleResize(): void {
    if (this.resizeTimer) {
      clearTimeout(this.resizeTimer);
    }

    this.resizeTimer = setTimeout(() => {
      // Auto-switch to single-page layout on narrow viewports
      const width = window.innerWidth;
      if (width < 768 && this.layoutMode === '2-page') {
        this.displayController.setLayout('1-page');
      }
      this.resizeTimer = null;
    }, 150);
  }

  private async handlePrev(): Promise<void> {
    if (this.isTumblrMode && this.tumblrReader) {
      await this.tumblrReader.prev();
      this.updateTumblrNavigation();
    } else {
      await this.engine?.prev();
    }
  }

  private async handleNext(): Promise<void> {
    if (this.isTumblrMode && this.tumblrReader) {
      await this.tumblrReader.next();
      this.updateTumblrNavigation();
    } else {
      await this.engine?.next();
    }
  }

  /**
   * Export cached Tumblr posts as EPUB
   */
  private async handleExport(): Promise<void> {
    if (!this.tumblrReader || this.isExporting) return;

    this.isExporting = true;
    this.exportProgress = 'Starting...';

    try {
      const blob = await this.tumblrReader.exportAsEpub((progress) => {
        this.exportProgress = progress.message;
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tumblr-export.epub';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      this.isExporting = false;
      this.exportProgress = '';
    }
  }

  /**
   * Clear the Tumblr post cache
   */
  private handleClearCache(): void {
    if (this.tumblrReader) {
      this.tumblrReader.clearCache();
      this.updateCachedPostCount();
    }
  }

  /**
   * Update the cached post count
   */
  private updateCachedPostCount(): void {
    if (this.tumblrReader) {
      this.cachedPostCount = this.tumblrReader.getCachedPostCount();
    }
  }

  private handleTocToggle(): void {
    this.tocOpen = !this.tocOpen;
  }

  private handleTocClose(): void {
    this.tocOpen = false;
  }

  private async handleTocSelect(e: CustomEvent<TocItem>): Promise<void> {
    const item = e.detail;
    const reader = this.getReader();

    if (reader?.goToTocItem) {
      await reader.goToTocItem(item);
    }

    this.tocOpen = false;
  }

  private handleZoomIn(): void {
    this.zoomController.zoomIn();
  }

  private handleZoomOut(): void {
    this.zoomController.zoomOut();
  }

  private handleLayoutToggle(): void {
    const newLayout = this.layoutMode === '1-page' ? '2-page' : '1-page';
    this.displayController.setLayout(newLayout);
  }

  /**
   * Load a file directly (for drag-drop or file picker)
   * This method is disabled when the `locked` property is true
   */
  async loadFile(file: File | Blob): Promise<void> {
    if (this.locked) {
      console.warn('SpeedReader: loadFile() is disabled when locked=true');
      return;
    }
    if (!this.contentRef) return;

    this.isLoading = true;
    this.error = null;
    this.tocItems = [];
    this.tocOpen = false;

    // Clean up Tumblr mode if active
    this.isTumblrMode = false;
    this.tumblrCanPrev = false;
    this.tumblrCanNext = false;
    this.tumblrReader?.destroy();
    this.tumblrReader = null;
    this.tumblr = undefined; // Clear so it can be set again later

    // Reset controllers
    this.zoomController.reset();
    this.displayController.reset();

    this.engine?.destroy();
    this.engine = new ReaderEngine();

    await this.engine.init(this.contentRef, {
      src: file,
      onError: (error) => {
        this.error = error;
        this.isLoading = false;
        this.dispatchEvent(new CustomEvent('error', { detail: error }));
      },
      onPageChange: (page, total) => {
        this.currentPage = page;
        this.totalPages = total;
        this.dispatchEvent(new CustomEvent('pagechange', { detail: { page, total } }));
      },
      onReady: () => {
        this.isLoading = false;
        const nav = this.engine?.getNavigation();
        if (nav) {
          this.currentPage = nav.currentPage;
          this.totalPages = nav.totalPages;
        }

        this.loadToc();

        // Check overflow state
        requestAnimationFrame(() => {
          this.updateOverflowState();
        });

        this.dispatchEvent(new CustomEvent('ready'));
      },
    });
  }

  private getPageAnnouncement(): string {
    if (this.totalChapters > 0) {
      return `Chapter ${this.currentChapter} of ${this.totalChapters}, Page ${this.currentPage} of ${this.totalPages}`;
    }
    return `Page ${this.currentPage} of ${this.totalPages}`;
  }

  override render() {
    // Handle navigation differently for Tumblr mode
    let canGoPrev: boolean;
    let canGoNext: boolean;

    if (this.isTumblrMode) {
      canGoPrev = this.tumblrCanPrev;
      canGoNext = this.tumblrCanNext;
    } else {
      canGoPrev = this.currentPage > 1 || this.currentChapter > 1;
      canGoNext = this.currentPage < this.totalPages || this.currentChapter < this.totalChapters;
    }

    const hasToc = this.tocItems.length > 0;
    const showZoom = !this.isTumblrMode; // Tumblr mode doesn't use zoom
    const showLayout = !this.isTumblrMode; // Tumblr mode doesn't use layout

    return html`
      <a href="#speed-reader-controls" class="skip-link">Skip to controls</a>
      <div
        class="container"
        part="container"
        role="application"
        aria-label="${this.isTumblrMode ? 'Tumblr reader' : 'Document reader'}"
      >
        <!-- TOC Panel (hidden in Tumblr mode) -->
        ${!this.isTumblrMode
          ? html`
              <toc-panel
                .items=${this.tocItems}
                ?open=${this.tocOpen}
                @close=${this.handleTocClose}
                @toc-select=${this.handleTocSelect}
              ></toc-panel>
            `
          : ''}

        <!-- Live region for screen reader announcements -->
        <div
          class="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          ${!this.isLoading && !this.error ? this.getPageAnnouncement() : ''}
        </div>

        <div
          class="reader-content"
          role="document"
          aria-label="${this.isLoading ? 'Loading' : this.isTumblrMode ? 'Tumblr post content' : 'Document content'}"
          tabindex="0"
        ></div>

        ${!this.isLoading && !this.error
          ? html`
              <reader-toolbar
                id="speed-reader-controls"
                part="controls"
                .currentPage=${this.currentPage}
                .totalPages=${this.totalPages}
                .zoomLevel=${this.zoomLevel}
                .layout=${this.layoutMode}
                .hasToc=${hasToc && !this.isTumblrMode}
                .tocOpen=${this.tocOpen}
                .canGoPrev=${canGoPrev}
                .canGoNext=${canGoNext}
                .showZoom=${showZoom}
                .showLayout=${showLayout}
                @toc-toggle=${this.handleTocToggle}
                @zoom-in=${this.handleZoomIn}
                @zoom-out=${this.handleZoomOut}
                @layout-toggle=${this.handleLayoutToggle}
                @prev=${this.handlePrev}
                @next=${this.handleNext}
              >
              </reader-toolbar>
              ${this.isTumblrMode
                ? html`
                    <div class="tumblr-controls">
                      <span class="cache-info">${this.cachedPostCount} post${this.cachedPostCount !== 1 ? 's' : ''} cached</span>
                      <button
                        class="clear-cache-btn"
                        @click=${this.handleClearCache}
                        ?disabled=${this.isExporting || this.cachedPostCount === 0}
                        title="Clear cached posts"
                      >
                        Clear
                      </button>
                      <button
                        class="export-btn"
                        @click=${this.handleExport}
                        ?disabled=${this.isExporting || this.cachedPostCount === 0}
                        title="Export cached posts as EPUB"
                      >
                        ${this.isExporting ? this.exportProgress || 'Exporting...' : 'Export EPUB'}
                      </button>
                    </div>
                  `
                : ''}
            `
          : ''}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'speed-reader': SpeedReader;
  }
}
