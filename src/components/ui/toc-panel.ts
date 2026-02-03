import { LitElement, html, css, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { TocItem } from '@/types';

/** Fixed height for each TOC item in pixels */
const ITEM_HEIGHT = 40;

/** Number of items to render above/below visible area */
const BUFFER_SIZE = 5;

/** Threshold for enabling virtual scrolling */
const VIRTUAL_SCROLL_THRESHOLD = 50;

/**
 * Slide-out Table of Contents panel with virtual scrolling for large lists
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

    /* Virtual scroll container */
    .toc-virtual-list {
      flex: 1;
      overflow-y: auto;
      margin: 0;
      position: relative;
    }

    .toc-virtual-spacer {
      pointer-events: none;
    }

    .toc-virtual-viewport {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .toc-item {
      margin: 0;
      padding: 0;
    }

    .toc-virtual-item {
      position: absolute;
      left: 0;
      right: 0;
      height: 40px;
      margin: 0;
      padding: 0;
    }

    .toc-item-btn {
      display: block;
      width: 100%;
      height: 100%;
      padding: 0.625rem 1rem;
      border: none;
      background: transparent;
      color: var(--speed-reader-text, #000000);
      text-align: left;
      font-size: 0.875rem;
      line-height: 1.4;
      cursor: pointer;
      transition: background 0.1s;
      box-sizing: border-box;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
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

  @state()
  private virtualScrollOffset = 0;

  @state()
  private containerHeight = 0;

  private previouslyFocusedElement: HTMLElement | null = null;
  private flatItems: TocItem[] = [];
  private resizeObserver: ResizeObserver | null = null;
  private scrollListenerAttached = false;

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('keydown', this.handleKeydown);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.handleKeydown);
    this.cleanupVirtualScroll();
  }

  private cleanupVirtualScroll(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    this.scrollListenerAttached = false;
  }

  override updated(changedProps: PropertyValues): void {
    if (changedProps.has('open')) {
      if (this.open) {
        // Store the previously focused element before opening
        this.previouslyFocusedElement = document.activeElement as HTMLElement;
        // Setup virtual scroll observers when opened
        this.setupVirtualScroll();
      }
      // Note: focus is moved out BEFORE close via moveFocusOutAndClose()
    }

    if (changedProps.has('items')) {
      // Rebuild flat items when items change
      this.flatItems = this.flattenItems(this.items);
    }
  }

  private setupVirtualScroll(): void {
    // Wait for render to complete before setting up observers
    requestAnimationFrame(() => {
      const virtualList = this.renderRoot.querySelector('.toc-virtual-list');
      if (!virtualList) return;

      // Setup scroll listener
      if (!this.scrollListenerAttached) {
        virtualList.addEventListener('scroll', this.handleScroll);
        this.scrollListenerAttached = true;
      }

      // Setup resize observer for container height
      if (!this.resizeObserver) {
        this.resizeObserver = new ResizeObserver((entries) => {
          for (const entry of entries) {
            this.containerHeight = entry.contentRect.height;
          }
        });
        this.resizeObserver.observe(virtualList);
      }

      // Initial measurement
      this.containerHeight = virtualList.clientHeight;
    });
  }

  private handleScroll = (e: Event): void => {
    const target = e.target as HTMLElement;
    this.virtualScrollOffset = target.scrollTop;
  };

  /**
   * Move focus out of the panel and then dispatch close event
   * This prevents aria-hidden focus warnings by moving focus before inert is applied
   */
  private moveFocusOutAndClose(): void {
    // Move focus out first
    const panel = this.renderRoot.querySelector('.panel');
    if (panel?.contains(document.activeElement)) {
      if (this.previouslyFocusedElement && document.body.contains(this.previouslyFocusedElement)) {
        this.previouslyFocusedElement.focus();
      } else {
        (document.activeElement as HTMLElement)?.blur();
      }
    }
    this.previouslyFocusedElement = null;

    // Then dispatch close event
    this.dispatchEvent(new CustomEvent('close'));
  }

  private handleKeydown = (e: KeyboardEvent): void => {
    if (!this.open) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      this.moveFocusOutAndClose();
    }
  };

  private handleBackdropClick = (): void => {
    this.moveFocusOutAndClose();
  };

  private handleClose(): void {
    this.moveFocusOutAndClose();
  }

  private handleItemClick(item: TocItem): void {
    // Move focus out before the panel closes to avoid aria-hidden warning
    if (this.previouslyFocusedElement && document.body.contains(this.previouslyFocusedElement)) {
      this.previouslyFocusedElement.focus();
    } else {
      (document.activeElement as HTMLElement)?.blur();
    }
    this.previouslyFocusedElement = null;

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

  /**
   * Check if virtual scrolling should be used based on item count
   */
  private get useVirtualScroll(): boolean {
    // Ensure flatItems is up to date (in case items changed before updated() ran)
    if (this.flatItems.length === 0 && this.items.length > 0) {
      this.flatItems = this.flattenItems(this.items);
    }
    return this.flatItems.length > VIRTUAL_SCROLL_THRESHOLD;
  }

  /**
   * Calculate the range of items to render based on scroll position
   */
  private getVisibleRange(): { start: number; end: number } {
    const itemCount = this.flatItems.length;
    if (itemCount === 0) return { start: 0, end: 0 };

    // Use a reasonable default if container height not yet measured
    // Assume ~500px viewport which fits ~12 items
    const effectiveHeight = this.containerHeight > 0 ? this.containerHeight : 500;
    const visibleCount = Math.ceil(effectiveHeight / ITEM_HEIGHT);
    const startIndex = Math.floor(this.virtualScrollOffset / ITEM_HEIGHT);

    const start = Math.max(0, startIndex - BUFFER_SIZE);
    const end = Math.min(itemCount, startIndex + visibleCount + BUFFER_SIZE);

    return { start, end };
  }

  /**
   * Render a single TOC item for virtual scrolling (positioned absolutely)
   */
  private renderVirtualItem(item: TocItem, index: number): unknown {
    const levelClass = item.level > 0 ? `toc-item-btn--level-${Math.min(item.level, 3)}` : '';
    const activeClass = item.id === this.activeId ? 'toc-item-btn--active' : '';
    const top = index * ITEM_HEIGHT;

    return html`
      <li
        class="toc-virtual-item"
        style="top: ${top}px"
      >
        <button
          class="toc-item-btn ${levelClass} ${activeClass}"
          @click=${() => this.handleItemClick(item)}
          aria-current=${item.id === this.activeId ? 'true' : 'false'}
        >
          ${item.label}
        </button>
      </li>
    `;
  }

  /**
   * Render the virtual scrolling list
   */
  private renderVirtualList(): unknown {
    const { start, end } = this.getVisibleRange();
    const totalHeight = this.flatItems.length * ITEM_HEIGHT;
    const visibleItems = this.flatItems.slice(start, end);

    return html`
      <div class="toc-virtual-list" role="tree">
        <div class="toc-virtual-spacer" style="height: ${totalHeight}px"></div>
        <ul class="toc-virtual-viewport">
          ${visibleItems.map((item, i) => this.renderVirtualItem(item, start + i))}
        </ul>
      </div>
    `;
  }

  /**
   * Render a standard (non-virtual) TOC item with nested children
   */
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

  /**
   * Render the standard (non-virtual) list
   */
  private renderStandardList(): unknown {
    return html`
      <ul class="toc-list" role="tree">
        ${this.items.map(item => this.renderTocItem(item))}
      </ul>
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
        ?inert=${!this.open}
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
          ? this.useVirtualScroll
            ? this.renderVirtualList()
            : this.renderStandardList()
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
