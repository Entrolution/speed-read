/**
 * Tumblr Reader - reads and renders Tumblr posts with series navigation
 * Uses legacy JSON API when available, falls back to HTML scraping
 */

import type {
  FormatReader,
  ReaderNavigation,
  TumblrPost,
  TumblrContentBlock,
  ReblogEntry,
} from '@/types';
import {
  fetchTumblrData,
  parseTumblrData,
  TumblrCache,
  generateEpub,
  type FetchResult,
  type ProgressCallback,
} from '@/core/tumblr';

export interface TumblrReaderOptions {
  /** Custom CORS proxy URL (appends encoded target URL) */
  customProxy?: string;
  /** Callback for page changes */
  onPageChange?: (page: number, total: number) => void;
}

/**
 * Reader implementation for Tumblr posts
 * Supports series navigation and EPUB export
 */
export class TumblrReader implements FormatReader {
  private container: HTMLElement | null = null;
  private currentPost: TumblrPost | null = null;
  private postHistory: string[] = [];
  private historyIndex = -1;
  private cache = new TumblrCache();
  private customProxy?: string;
  private onPageChangeCallback?: (page: number, total: number) => void;
  private isLoading = false;
  private boundKeyHandler: ((e: KeyboardEvent) => void) | null = null;

  /**
   * Load a Tumblr post from URL
   * Note: This signature differs from other readers - it takes a URL string, not ArrayBuffer
   */
  async load(_data: ArrayBuffer, _container: HTMLElement): Promise<void> {
    // This method signature is for interface compatibility
    // TumblrReader is loaded differently via loadFromUrl
    throw new Error('TumblrReader must be loaded via loadFromUrl()');
  }

  /**
   * Load a Tumblr post from URL
   */
  async loadFromUrl(url: string, container: HTMLElement, options?: TumblrReaderOptions): Promise<void> {
    this.container = container;
    this.customProxy = options?.customProxy;
    this.onPageChangeCallback = options?.onPageChange;

    // Initialize history with the starting URL
    this.postHistory = [url];
    this.historyIndex = 0;

    await this.loadPost(url);

    // Set up keyboard navigation
    this.setupKeyboardNavigation();
  }

  /**
   * Load a post by URL
   */
  private async loadPost(url: string): Promise<void> {
    if (!this.container) return;

    this.isLoading = true;
    this.showLoading();

    try {
      // Check cache first
      const cached = this.cache.get(url);
      if (cached) {
        this.currentPost = cached;
        this.renderPost();
        this.notifyPageChange();
        return;
      }

      // Fetch data (API first, then HTML fallback)
      const result: FetchResult = await fetchTumblrData(url, {
        customProxy: this.customProxy,
      });

      // Parse the data
      this.currentPost = parseTumblrData(result, url);

      // If we got data from API and need navigation links, try HTML
      if (result.type === 'api' && !this.currentPost.nextPostUrl && !this.currentPost.prevPostUrl) {
        // Navigation links aren't in the API response
        // We could optionally fetch HTML just for navigation, but skip for now
        // as it would double the requests
      }

      // Cache the result
      this.cache.set(url, this.currentPost);

      this.renderPost();
      this.notifyPageChange();
    } catch (err) {
      this.showError(err instanceof Error ? err.message : 'Failed to load post');
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Show loading indicator
   */
  private showLoading(): void {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="tumblr-loading">
        <div class="tumblr-spinner"></div>
        <p>Loading post...</p>
      </div>
    `;
  }

  /**
   * Show error message
   */
  private showError(message: string): void {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="tumblr-error">
        <div class="tumblr-error-icon">!</div>
        <h2>Could not load post</h2>
        <p>${this.escapeHtml(message)}</p>
        <button class="tumblr-retry-btn" onclick="this.closest('.tumblr-error').dispatchEvent(new CustomEvent('retry', { bubbles: true }))">
          Try Again
        </button>
      </div>
    `;

    // Listen for retry
    this.container.querySelector('.tumblr-error')?.addEventListener('retry', () => {
      const currentUrl = this.postHistory[this.historyIndex];
      if (currentUrl) {
        this.loadPost(currentUrl);
      }
    });
  }

  /**
   * Render the current post
   */
  private renderPost(): void {
    if (!this.container || !this.currentPost) return;

    const post = this.currentPost;

    // Build reblog trail HTML
    const trailHtml = post.reblogTrail.length > 0
      ? `<div class="tumblr-reblog-trail">${post.reblogTrail.map(entry => this.renderReblogEntry(entry)).join('')}</div>`
      : '';

    // Build main content HTML
    const contentHtml = post.content.map(block => this.renderBlock(block)).join('');

    // Title
    const titleHtml = post.title
      ? `<h1 class="tumblr-title">${this.escapeHtml(post.title)}</h1>`
      : '';

    // Tags
    const tagsHtml = post.tags.length > 0
      ? `<div class="tumblr-tags">${post.tags.map(t => `<span class="tumblr-tag">#${this.escapeHtml(t)}</span>`).join(' ')}</div>`
      : '';

    this.container.innerHTML = `
      <article class="tumblr-post">
        ${titleHtml}
        ${trailHtml}
        <div class="tumblr-content">
          <div class="tumblr-author">
            <a href="${this.escapeHtml(post.blogUrl)}" target="_blank" rel="noopener">
              <strong>${this.escapeHtml(post.blogName)}</strong>
            </a>
          </div>
          ${contentHtml}
        </div>
        ${tagsHtml}
      </article>
    `;

    // Scroll to top
    this.container.scrollTop = 0;
  }

  /**
   * Render a reblog entry
   */
  private renderReblogEntry(entry: ReblogEntry): string {
    const content = entry.content.map(b => this.renderBlock(b)).join('');
    return `
      <div class="tumblr-reblog-entry">
        <div class="tumblr-reblog-author">
          <a href="${this.escapeHtml(entry.blogUrl)}" target="_blank" rel="noopener">
            ${this.escapeHtml(entry.blogName)}
          </a>
        </div>
        <div class="tumblr-reblog-content">${content}</div>
      </div>
    `;
  }

  /**
   * Render a content block
   */
  private renderBlock(block: TumblrContentBlock): string {
    switch (block.type) {
      case 'heading1':
        return `<h1>${this.escapeHtml(block.text || '')}</h1>`;
      case 'heading2':
        return `<h2>${this.escapeHtml(block.text || '')}</h2>`;
      case 'image':
        return block.url
          ? `<img src="${this.escapeHtml(block.url)}" alt="" class="tumblr-image" loading="lazy" />`
          : '';
      case 'link':
        return block.url
          ? `<p><a href="${this.escapeHtml(block.url)}" target="_blank" rel="noopener">${this.escapeHtml(block.text || block.url)}</a></p>`
          : `<p>${this.escapeHtml(block.text || '')}</p>`;
      case 'video':
        return `<div class="tumblr-video">[Video: ${this.escapeHtml(block.url || 'embedded')}]</div>`;
      case 'audio':
        return `<div class="tumblr-audio">[Audio: ${this.escapeHtml(block.url || 'embedded')}]</div>`;
      case 'text':
      default:
        // Text may contain safe HTML from formatting
        return `<p>${this.sanitizeHtml(block.text || '')}</p>`;
    }
  }

  /**
   * Set up keyboard navigation
   */
  private setupKeyboardNavigation(): void {
    this.boundKeyHandler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          if (!this.isLoading && this.canGoNext()) {
            e.preventDefault();
            this.next();
          }
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          if (!this.isLoading && this.canGoPrev()) {
            e.preventDefault();
            this.prev();
          }
          break;
      }
    };

    document.addEventListener('keydown', this.boundKeyHandler);
  }

  /**
   * Check if can navigate to next post
   */
  private canGoNext(): boolean {
    return !!this.currentPost?.nextPostUrl;
  }

  /**
   * Check if can navigate to previous post
   */
  private canGoPrev(): boolean {
    // Can go back through history or to previous post URL
    return this.historyIndex > 0 || !!this.currentPost?.prevPostUrl;
  }

  /**
   * Navigate to next post
   */
  async next(): Promise<void> {
    if (!this.currentPost?.nextPostUrl) return;

    const nextUrl = this.currentPost.nextPostUrl;

    // Add to history (truncate any forward history)
    this.postHistory = this.postHistory.slice(0, this.historyIndex + 1);
    this.postHistory.push(nextUrl);
    this.historyIndex = this.postHistory.length - 1;

    await this.loadPost(nextUrl);
  }

  /**
   * Navigate to previous post
   */
  async prev(): Promise<void> {
    // First try going back through history
    if (this.historyIndex > 0) {
      this.historyIndex--;
      const prevUrl = this.postHistory[this.historyIndex];
      await this.loadPost(prevUrl);
      return;
    }

    // Otherwise try the post's prev URL
    if (this.currentPost?.prevPostUrl) {
      const prevUrl = this.currentPost.prevPostUrl;
      this.postHistory.unshift(prevUrl);
      // historyIndex stays at 0, but history is now longer
      await this.loadPost(prevUrl);
    }
  }

  /**
   * Navigate to a specific post by index in history
   */
  async goTo(page: number): Promise<void> {
    const index = page - 1;
    if (index >= 0 && index < this.postHistory.length) {
      this.historyIndex = index;
      await this.loadPost(this.postHistory[index]);
    }
  }

  /**
   * Notify about page change
   */
  private notifyPageChange(): void {
    if (this.onPageChangeCallback) {
      // Page count is the history length (grows as user explores)
      this.onPageChangeCallback(this.historyIndex + 1, this.postHistory.length);
    }
  }

  /**
   * Get navigation controls
   */
  getNavigation(): ReaderNavigation {
    return {
      currentPage: this.historyIndex + 1,
      totalPages: this.postHistory.length,
      next: () => this.next(),
      prev: () => this.prev(),
      goTo: (page: number) => this.goTo(page),
    };
  }

  /**
   * Check if navigation is available
   */
  hasNavigation(): { canPrev: boolean; canNext: boolean } {
    return {
      canPrev: this.canGoPrev(),
      canNext: this.canGoNext(),
    };
  }

  /**
   * Get current post data
   */
  getCurrentPost(): TumblrPost | null {
    return this.currentPost;
  }

  /**
   * Export all cached posts as EPUB
   * @param onProgress Optional progress callback
   * @param title Optional title for the EPUB (defaults to blog name)
   */
  async exportAsEpub(onProgress?: ProgressCallback, title?: string): Promise<Blob> {
    const posts = this.cache.getAllCached();

    if (posts.length === 0 && this.currentPost) {
      // At least export current post
      const epubTitle = title || this.currentPost.blogName;
      return generateEpub([this.currentPost], epubTitle, onProgress);
    }

    const epubTitle = title || posts[0]?.blogName || this.currentPost?.blogName || 'Tumblr Export';
    return generateEpub(posts, epubTitle, onProgress);
  }

  /**
   * Get the current blog name
   */
  getBlogName(): string | undefined {
    return this.currentPost?.blogName;
  }

  /**
   * Get the number of cached posts
   */
  getCachedPostCount(): number {
    return this.cache.getAllCached().length;
  }

  /**
   * Clear the post cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Set page change callback
   */
  setOnPageChange(callback: (page: number, total: number) => void): void {
    this.onPageChangeCallback = callback;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.boundKeyHandler) {
      document.removeEventListener('keydown', this.boundKeyHandler);
      this.boundKeyHandler = null;
    }

    this.container = null;
    this.currentPost = null;
    this.postHistory = [];
    this.historyIndex = -1;
    this.onPageChangeCallback = undefined;
  }

  /**
   * Escape HTML special characters
   */
  // Escape map for single-pass HTML escaping (more efficient than chained replaces)
  private static readonly HTML_ESCAPE_MAP: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };

  private escapeHtml(text: string): string {
    return text.replace(/[&<>"']/g, char => TumblrReader.HTML_ESCAPE_MAP[char]);
  }

  /**
   * Sanitize HTML, keeping only safe tags
   */
  private sanitizeHtml(html: string): string {
    // Simple sanitization - allow basic formatting tags
    const allowedTags = ['strong', 'em', 'b', 'i', 's', 'u', 'br'];

    // Create a temporary div to parse HTML
    const temp = document.createElement('div');
    temp.innerHTML = html;

    // Walk through and clean up
    const clean = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) {
        return this.escapeHtml(node.textContent || '');
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        return '';
      }

      const element = node as Element;
      const tagName = element.tagName.toLowerCase();

      // Handle allowed tags
      if (allowedTags.includes(tagName)) {
        const children = Array.from(element.childNodes).map(clean).join('');
        if (tagName === 'br') {
          return '<br/>';
        }
        return `<${tagName}>${children}</${tagName}>`;
      }

      // Handle links specially
      if (tagName === 'a') {
        const href = element.getAttribute('href');
        const children = Array.from(element.childNodes).map(clean).join('');
        if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
          return `<a href="${this.escapeHtml(href)}" target="_blank" rel="noopener">${children}</a>`;
        }
        return children;
      }

      // For other tags, just include their text content
      return Array.from(element.childNodes).map(clean).join('');
    };

    return Array.from(temp.childNodes).map(clean).join('');
  }
}
