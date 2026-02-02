import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

/**
 * Minimizable toolbar for reader controls
 *
 * @element reader-toolbar
 *
 * @fires toc-toggle - Fired when TOC button is clicked
 * @fires zoom-in - Fired when zoom in button is clicked
 * @fires zoom-out - Fired when zoom out button is clicked
 * @fires layout-toggle - Fired when layout toggle is clicked
 * @fires prev - Fired when previous button is clicked
 * @fires next - Fired when next button is clicked
 */
@customElement('reader-toolbar')
export class ReaderToolbar extends LitElement {
  static override styles = css`
    :host {
      display: block;
      position: relative;
      font-family: system-ui, -apple-system, sans-serif;
    }

    .toolbar {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.25rem;
      padding: 0.5rem;
      background: var(--speed-reader-bg, #ffffff);
      border-top: 1px solid #e0e0e0;
      transition: height 0.2s ease;
    }

    .toolbar-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      padding: 0;
      border: none;
      background: transparent;
      color: var(--speed-reader-text, #000000);
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.15s;
      font-size: 1.25rem;
      line-height: 1;
    }

    .toolbar-btn:hover:not(:disabled) {
      background: rgba(0, 0, 0, 0.08);
    }

    .toolbar-btn:active:not(:disabled) {
      background: rgba(0, 0, 0, 0.12);
    }

    .toolbar-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .toolbar-btn:focus-visible {
      outline: 2px solid var(--speed-reader-accent, #0066cc);
      outline-offset: 2px;
    }

    .toolbar-btn--active {
      background: rgba(0, 102, 204, 0.1);
      color: var(--speed-reader-accent, #0066cc);
    }

    .separator {
      width: 1px;
      height: 24px;
      background: #e0e0e0;
      margin: 0 0.25rem;
    }

    .page-info {
      font-size: 0.875rem;
      color: var(--speed-reader-text, #000000);
      opacity: 0.8;
      min-width: 70px;
      text-align: center;
      white-space: nowrap;
    }

    .zoom-display {
      font-size: 0.75rem;
      min-width: 40px;
      text-align: center;
      color: var(--speed-reader-text, #000000);
      opacity: 0.7;
    }

    .expanded-controls {
      display: contents;
    }

    .minimized .expanded-controls {
      display: none;
    }

    @media (max-width: 480px) {
      .toolbar {
        padding: 0.25rem;
      }

      .toolbar-btn {
        width: 32px;
        height: 32px;
        font-size: 1.1rem;
      }

      .page-info {
        font-size: 0.75rem;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .toolbar {
        transition: none;
      }
    }

    @media (prefers-color-scheme: dark) {
      .toolbar {
        border-top-color: #333;
      }

      .toolbar-btn:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.1);
      }

      .separator {
        background: #444;
      }
    }
  `;

  @property({ type: Number })
  currentPage = 1;

  @property({ type: Number })
  totalPages = 1;

  @property({ type: Number })
  zoomLevel = 1.0;

  @property({ type: String })
  layout: '1-page' | '2-page' = '1-page';

  @property({ type: Boolean })
  hasToc = false;

  @property({ type: Boolean })
  tocOpen = false;

  @property({ type: Boolean })
  canGoPrev = false;

  @property({ type: Boolean })
  canGoNext = false;

  @state()
  private minimized = true;

  private handleTocClick(): void {
    this.dispatchEvent(new CustomEvent('toc-toggle'));
  }

  private handleZoomIn(): void {
    this.dispatchEvent(new CustomEvent('zoom-in'));
  }

  private handleZoomOut(): void {
    this.dispatchEvent(new CustomEvent('zoom-out'));
  }

  private handleLayoutToggle(): void {
    this.dispatchEvent(new CustomEvent('layout-toggle'));
  }

  private handlePrev(): void {
    this.dispatchEvent(new CustomEvent('prev'));
  }

  private handleNext(): void {
    this.dispatchEvent(new CustomEvent('next'));
  }

  private handleExpand(): void {
    this.minimized = false;
  }

  private handleMinimize(): void {
    this.minimized = true;
  }

  override render() {
    const zoomPercent = Math.round(this.zoomLevel * 100);

    return html`
      <nav
        class="toolbar ${this.minimized ? 'minimized' : ''}"
        role="toolbar"
        aria-label="Reader controls"
      >
        <!-- Expanded controls -->
        <div class="expanded-controls">
          ${this.hasToc
            ? html`
                <button
                  class="toolbar-btn ${this.tocOpen ? 'toolbar-btn--active' : ''}"
                  @click=${this.handleTocClick}
                  aria-label="Table of contents"
                  aria-pressed=${this.tocOpen}
                  title="Table of contents"
                >
                  ☰
                </button>
                <div class="separator" aria-hidden="true"></div>
              `
            : ''}

          <button
            class="toolbar-btn"
            @click=${this.handleZoomOut}
            aria-label="Zoom out"
            title="Zoom out"
            ?disabled=${this.zoomLevel <= 0.5}
          >
            −
          </button>
          <span class="zoom-display" aria-label="Current zoom level">${zoomPercent}%</span>
          <button
            class="toolbar-btn"
            @click=${this.handleZoomIn}
            aria-label="Zoom in"
            title="Zoom in"
            ?disabled=${this.zoomLevel >= 3.0}
          >
            +
          </button>

          <div class="separator" aria-hidden="true"></div>

          <button
            class="toolbar-btn ${this.layout === '1-page' ? 'toolbar-btn--active' : ''}"
            @click=${this.handleLayoutToggle}
            aria-label=${this.layout === '1-page' ? 'Switch to two-page view' : 'Switch to single-page view'}
            title=${this.layout === '1-page' ? 'Two-page view' : 'Single-page view'}
          >
            ${this.layout === '1-page' ? '⊡' : '⊟'}
          </button>

          <div class="separator" aria-hidden="true"></div>
        </div>

        <!-- Always visible navigation controls -->
        <button
          class="toolbar-btn"
          @click=${this.handlePrev}
          ?disabled=${!this.canGoPrev}
          aria-label="Previous page"
          title="Previous page"
        >
          ‹
        </button>

        <span class="page-info" aria-live="polite">
          ${this.currentPage} / ${this.totalPages}
        </span>

        <button
          class="toolbar-btn"
          @click=${this.handleNext}
          ?disabled=${!this.canGoNext}
          aria-label="Next page"
          title="Next page"
        >
          ›
        </button>

        <!-- Expand/Minimize toggle -->
        ${this.minimized
          ? html`
              <div class="separator" aria-hidden="true"></div>
              <button
                class="toolbar-btn"
                @click=${this.handleExpand}
                aria-label="Show more controls"
                title="More controls"
              >
                ⋯
              </button>
            `
          : html`
              <div class="separator" aria-hidden="true"></div>
              <button
                class="toolbar-btn"
                @click=${this.handleMinimize}
                aria-label="Hide controls"
                title="Minimize"
              >
                ×
              </button>
            `}
      </nav>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'reader-toolbar': ReaderToolbar;
  }
}
