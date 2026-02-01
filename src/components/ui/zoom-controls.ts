import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { FitMode } from '@/types';

/**
 * Zoom controls with fit mode selector
 *
 * @element zoom-controls
 *
 * @fires zoom-change - Fired when zoom level changes
 * @fires fit-mode-change - Fired when fit mode changes
 */
@customElement('zoom-controls')
export class ZoomControls extends LitElement {
  static override styles = css`
    :host {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
    }

    .zoom-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      padding: 0;
      border: 1px solid #e0e0e0;
      background: var(--speed-reader-bg, #ffffff);
      color: var(--speed-reader-text, #000000);
      border-radius: 4px;
      cursor: pointer;
      font-size: 1.1rem;
      line-height: 1;
      transition: background 0.15s, border-color 0.15s;
    }

    .zoom-btn:hover:not(:disabled) {
      background: rgba(0, 0, 0, 0.05);
      border-color: #ccc;
    }

    .zoom-btn:active:not(:disabled) {
      background: rgba(0, 0, 0, 0.1);
    }

    .zoom-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .zoom-btn:focus-visible {
      outline: 2px solid var(--speed-reader-accent, #0066cc);
      outline-offset: 2px;
    }

    .zoom-display {
      font-size: 0.8rem;
      min-width: 45px;
      text-align: center;
      color: var(--speed-reader-text, #000000);
      font-variant-numeric: tabular-nums;
    }

    .fit-select {
      padding: 0.25rem 0.5rem;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      background: var(--speed-reader-bg, #ffffff);
      color: var(--speed-reader-text, #000000);
      font-size: 0.75rem;
      cursor: pointer;
    }

    .fit-select:focus-visible {
      outline: 2px solid var(--speed-reader-accent, #0066cc);
      outline-offset: 2px;
    }

    @media (prefers-color-scheme: dark) {
      .zoom-btn {
        border-color: #444;
      }

      .zoom-btn:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.1);
        border-color: #666;
      }

      .fit-select {
        border-color: #444;
      }
    }
  `;

  @property({ type: Number })
  level = 1.0;

  @property({ type: String })
  fitMode: FitMode = 'page';

  @property({ type: Boolean })
  canZoomIn = true;

  @property({ type: Boolean })
  canZoomOut = true;

  @property({ type: Boolean })
  showFitSelect = true;

  private handleZoomIn(): void {
    this.dispatchEvent(new CustomEvent('zoom-change', { detail: { delta: 0.1 } }));
  }

  private handleZoomOut(): void {
    this.dispatchEvent(new CustomEvent('zoom-change', { detail: { delta: -0.1 } }));
  }

  private handleFitModeChange(e: Event): void {
    const select = e.target as HTMLSelectElement;
    this.dispatchEvent(new CustomEvent('fit-mode-change', { detail: select.value as FitMode }));
  }

  override render() {
    const zoomPercent = Math.round(this.level * 100);

    return html`
      <button
        class="zoom-btn"
        @click=${this.handleZoomOut}
        ?disabled=${!this.canZoomOut}
        aria-label="Zoom out"
        title="Zoom out (Ctrl+-)"
      >
        −
      </button>

      <span class="zoom-display" aria-label="Current zoom: ${zoomPercent}%">
        ${zoomPercent}%
      </span>

      <button
        class="zoom-btn"
        @click=${this.handleZoomIn}
        ?disabled=${!this.canZoomIn}
        aria-label="Zoom in"
        title="Zoom in (Ctrl++)"
      >
        +
      </button>

      ${this.showFitSelect
        ? html`
            <select
              class="fit-select"
              .value=${this.fitMode}
              @change=${this.handleFitModeChange}
              aria-label="Fit mode"
            >
              <option value="page">Fit Page</option>
              <option value="width">Fit Width</option>
              <option value="none">Custom</option>
            </select>
          `
        : ''}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'zoom-controls': ZoomControls;
  }
}
