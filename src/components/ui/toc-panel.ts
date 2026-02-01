import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { TocItem } from '@/types';

/**
 * Slide-out Table of Contents panel
 *
 * @element toc-panel
 *
 * @fires toc-select - Fired when a TOC item is selected
 * @fires close - Fired when panel should close
 */
@customElement('toc-panel')
export class TocPanel extends LitElement {
  static override styles = css`
    :host {
      display: block;
      position: absolute;
      top: 0;
      left: 0;
      bottom: 0;
      z-index: 100;
      pointer-events: none;
    }

    .backdrop {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.3);
      opacity: 0;
      transition: opacity 0.2s ease;
      pointer-events: none;
    }

    :host([open]) .backdrop {
      opacity: 1;
      pointer-events: auto;
    }

    .panel {
      position: absolute;
      top: 0;
      left: 0;
      width: var(--speed-reader-toc-width, 280px);
      max-width: 85vw;
      height: 100%;
      background: var(--speed-reader-toc-bg, var(--speed-reader-bg, #ffffff));
      box-shadow: 2px 0 8px rgba(0, 0, 0, 0.15);
      transform: translateX(-100%);
      transition: transform 0.25s ease;
      display: flex;
      flex-direction: column;
      pointer-events: auto;
    }

    :host([open]) .panel {
      transform: translateX(0);
    }

    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1rem;
      border-bottom: 1px solid #e0e0e0;
    }

    .panel-title {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
      color: var(--speed-reader-text, #000000);
    }

    .close-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      padding: 0;
      border: none;
      background: transparent;
      color: var(--speed-reader-text, #000000);
      border-radius: 4px;
      cursor: pointer;
      font-size: 1.25rem;
    }

    .close-btn:hover {
      background: var(--speed-reader-toc-hover, rgba(0, 0, 0, 0.05));
    }

    .close-btn:focus-visible {
      outline: 2px solid var(--speed-reader-accent, #0066cc);
      outline-offset: -2px;
    }

    .toc-list {
      flex: 1;
      overflow-y: auto;
      padding: 0.5rem 0;
      margin: 0;
      list-style: none;
    }

    .toc-item {
      margin: 0;
      padding: 0;
    }

    .toc-item-btn {
      display: block;
      width: 100%;
      padding: 0.75rem 1rem;
      border: none;
      background: transparent;
      color: var(--speed-reader-text, #000000);
      text-align: left;
      font-size: 0.875rem;
      line-height: 1.4;
      cursor: pointer;
      transition: background 0.1s;
    }

    .toc-item-btn:hover {
      background: var(--speed-reader-toc-hover, rgba(0, 0, 0, 0.05));
    }

    .toc-item-btn:focus-visible {
      outline: 2px solid var(--speed-reader-accent, #0066cc);
      outline-offset: -2px;
    }

    .toc-item-btn--active {
      background: var(--speed-reader-toc-active, rgba(0, 0, 0, 0.1));
      font-weight: 500;
    }

    .toc-item-btn--level-1 {
      padding-left: 2rem;
    }

    .toc-item-btn--level-2 {
      padding-left: 3rem;
    }

    .toc-item-btn--level-3 {
      padding-left: 4rem;
    }

    .toc-children {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .no-toc {
      padding: 2rem;
      text-align: center;
      color: var(--speed-reader-text, #000000);
      opacity: 0.6;
    }

    @media (prefers-reduced-motion: reduce) {
      .backdrop,
      .panel {
        transition: none;
      }
    }

    @media (prefers-color-scheme: dark) {
      .panel {
        box-shadow: 2px 0 12px rgba(0, 0, 0, 0.4);
      }

      .panel-header {
        border-bottom-color: #333;
      }
    }
  `;

  @property({ type: Array })
  items: TocItem[] = [];

  @property({ type: String, reflect: true })
  activeId?: string;

  @property({ type: Boolean, reflect: true })
  open = false;

  @state()
  private focusedIndex = -1;

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('keydown', this.handleKeydown);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.handleKeydown);
  }

  private handleKeydown = (e: KeyboardEvent): void => {
    if (!this.open) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      this.handleClose();
    }
  };

  private handleBackdropClick = (): void => {
    this.handleClose();
  };

  private handleClose(): void {
    this.dispatchEvent(new CustomEvent('close'));
  }

  private handleItemClick(item: TocItem): void {
    this.dispatchEvent(new CustomEvent('toc-select', { detail: item }));
  }

  private flattenItems(items: TocItem[]): TocItem[] {
    const result: TocItem[] = [];
    const traverse = (list: TocItem[]) => {
      for (const item of list) {
        result.push(item);
        if (item.children) {
          traverse(item.children);
        }
      }
    };
    traverse(items);
    return result;
  }

  private renderTocItem(item: TocItem): unknown {
    const levelClass = item.level > 0 ? `toc-item-btn--level-${Math.min(item.level, 3)}` : '';
    const activeClass = item.id === this.activeId ? 'toc-item-btn--active' : '';

    return html`
      <li class="toc-item">
        <button
          class="toc-item-btn ${levelClass} ${activeClass}"
          @click=${() => this.handleItemClick(item)}
          aria-current=${item.id === this.activeId ? 'true' : 'false'}
        >
          ${item.label}
        </button>
        ${item.children && item.children.length > 0
          ? html`
              <ul class="toc-children" role="group">
                ${item.children.map(child => this.renderTocItem(child))}
              </ul>
            `
          : ''}
      </li>
    `;
  }

  override render() {
    return html`
      <div
        class="backdrop"
        @click=${this.handleBackdropClick}
        aria-hidden="true"
      ></div>
      <aside
        class="panel"
        role="navigation"
        aria-label="Table of contents"
        aria-hidden=${!this.open}
      >
        <header class="panel-header">
          <h2 class="panel-title">Contents</h2>
          <button
            class="close-btn"
            @click=${this.handleClose}
            aria-label="Close table of contents"
          >
            ×
          </button>
        </header>
        ${this.items.length > 0
          ? html`
              <ul class="toc-list" role="tree">
                ${this.items.map(item => this.renderTocItem(item))}
              </ul>
            `
          : html`
              <div class="no-toc">
                No table of contents available
              </div>
            `}
      </aside>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'toc-panel': TocPanel;
  }
}
