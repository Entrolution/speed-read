import { LitElement, html, css, PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { ReaderEngine } from '@/core/engine';
import type { ReaderError } from '@/types';

/**
 * Speed Reader Web Component
 *
 * @element speed-reader
 *
 * @attr {string} src - URL to the document file
 * @attr {string} manifest - URL to the chapters.json manifest
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
      min-height: 0; /* Important for flex child to respect container bounds */
    }

    .controls {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 1rem;
      padding: 0.5rem;
      background: var(--speed-reader-bg, #ffffff);
      border-top: 1px solid #e0e0e0;
    }

    .controls button {
      padding: 0.5rem 1rem;
      border: 1px solid var(--speed-reader-accent, #0066cc);
      background: transparent;
      color: var(--speed-reader-accent, #0066cc);
      border-radius: 4px;
      cursor: pointer;
      font-size: 1rem;
      transition: background 0.2s, color 0.2s;
    }

    .controls button:hover:not(:disabled) {
      background: var(--speed-reader-accent, #0066cc);
      color: white;
    }

    .controls button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .page-info {
      font-size: 0.875rem;
      color: var(--speed-reader-text, #000000);
      opacity: 0.7;
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

  private engine: ReaderEngine | null = null;
  private contentRef: HTMLElement | null = null;

  override connectedCallback(): void {
    super.connectedCallback();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.engine?.destroy();
    this.engine = null;
  }

  override firstUpdated(): void {
    this.contentRef = this.renderRoot.querySelector('.reader-content') as HTMLElement;
    this.initReader();
  }

  override updated(changedProps: PropertyValues): void {
    if (changedProps.has('src') || changedProps.has('manifest')) {
      if (changedProps.get('src') !== undefined || changedProps.get('manifest') !== undefined) {
        this.initReader();
      }
    }
  }

  private async initReader(): Promise<void> {
    if (!this.contentRef) return;
    if (!this.src && !this.manifest) return;

    this.isLoading = true;
    this.error = null;

    // Clean up previous engine
    this.engine?.destroy();

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
        this.dispatchEvent(new CustomEvent('ready'));
      },
    });
  }

  private async handlePrev(): Promise<void> {
    await this.engine?.prev();
  }

  private async handleNext(): Promise<void> {
    await this.engine?.next();
  }

  /**
   * Load a file directly (for drag-drop or file picker)
   */
  async loadFile(file: File | Blob): Promise<void> {
    if (!this.contentRef) return;

    this.isLoading = true;
    this.error = null;

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
        this.dispatchEvent(new CustomEvent('ready'));
      },
    });
  }

  override render() {
    return html`
      <div class="container" part="container">
        <div class="reader-content"></div>
        ${!this.isLoading && !this.error
          ? html`
              <div class="controls" part="controls">
                <button
                  @click=${this.handlePrev}
                  ?disabled=${this.currentPage <= 1 && this.currentChapter <= 1}
                  aria-label="Previous page"
                >
                  Previous
                </button>
                <span class="page-info">
                  ${this.totalChapters > 0
                    ? html`Ch ${this.currentChapter}/${this.totalChapters} &middot; `
                    : ''}
                  Page ${this.currentPage} / ${this.totalPages}
                </span>
                <button
                  @click=${this.handleNext}
                  ?disabled=${this.currentPage >= this.totalPages &&
                  this.currentChapter >= this.totalChapters}
                  aria-label="Next page"
                >
                  Next
                </button>
              </div>
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
