/**
 * Tumblr Playlist Reader - reads a Google Doc containing Tumblr URLs as a navigable playlist
 * Creates a ToC from the playlist entries and supports EPUB export
 */

import type {
  FormatReader,
  ReaderNavigation,
  TumblrPost,
  TocItem,
} from '@/types';
import {
  fetchTumblrData,
  parseTumblrData,
  TumblrCache,
  generateEpub,
  fetchViaCorsProxy,
  renderBlock,
  renderReblogEntry,
  type ProgressCallback,
} from '@/core/tumblr';
import {
  getGoogleDocExportUrl,
  extractTumblrUrls,
  extractLabelFromUrl,
  extractBlogNameFromUrl,
} from '@/core/tumblr/playlist-parser';
import {
  escapeHtml,
  createLoadingHtml,
  createErrorHtml,
  createSkeletonHtml,
  setupRetryListener,
  setupKeyboardNavigation,
} from '@/core/utils';

export interface TumblrPlaylistReaderOptions {
  /** Custom CORS proxy URL (appends encoded target URL) */
  customProxy?: string;
  /** Callback for page changes */
  onPageChange?: (page: number, total: number) => void;
  /** Callback when ToC is updated (e.g., after loading reveals actual title) */
  onTocUpdate?: () => void;
}

/**
 * Extended TocItem with cache status
 */
export interface PlaylistTocItem extends TocItem {
  /** Whether this post is cached */
  isCached?: boolean;
  /** Original URL for this entry */
  url: string;
}

/**
 * Reader implementation for Tumblr playlists from Google Docs
 * Supports ToC navigation and EPUB export
 */
export class TumblrPlaylistReader implements FormatReader {
  private container: HTMLElement | null = null;
  private playlistUrls: string[] = [];
  private currentIndex = 0;
  private currentPost: TumblrPost | null = null;
  private cache = new TumblrCache();
  private customProxy?: string;
  private cachedToc: PlaylistTocItem[] = [];
  private onPageChangeCallback?: (page: number, total: number) => void;
  private onTocUpdateCallback?: () => void;
  private isLoading = false;
  private cleanupKeyboardNav: (() => void) | null = null;
  private isPrefetching = false;
  private prefetchProgress = 0;
  // AbortController for canceling stale prefetch requests
  private prefetchAbortController: AbortController | null = null;
  // Track navigation direction for adaptive preloading
  private lastIndex = 0;

  /**
   * Load interface - not used for playlist reader
   */
  async load(_data: ArrayBuffer, _container: HTMLElement): Promise<void> {
    throw new Error('TumblrPlaylistReader must be loaded via loadFromPlaylist()');
  }

  /**
   * Load playlist from Google Doc URL
   */
  async loadFromPlaylist(
    playlistUrl: string,
    container: HTMLElement,
    options?: TumblrPlaylistReaderOptions
  ): Promise<void> {
    this.container = container;
    this.customProxy = options?.customProxy;
    this.onPageChangeCallback = options?.onPageChange;
    this.onTocUpdateCallback = options?.onTocUpdate;

    // Show loading state
    this.showLoading('Fetching playlist...');

    try {
      // Fetch and parse Google Doc
      const exportUrl = getGoogleDocExportUrl(playlistUrl);
      const text = await fetchViaCorsProxy(exportUrl, {
        customProxy: this.customProxy,
      });

      this.playlistUrls = extractTumblrUrls(text);

      if (this.playlistUrls.length === 0) {
        throw new Error('No Tumblr URLs found in the document');
      }

      // Generate ToC from URLs
      this.cachedToc = this.playlistUrls.map((url, index) => ({
        id: `playlist-${index}`,
        label: extractLabelFromUrl(url),
        page: index + 1,
        level: 0,
        url,
        isCached: this.cache.has(url),
      }));

      // Load first post
      await this.loadPost(0);

      // Setup keyboard navigation
      this.setupKeyboardNavigation();
    } catch (err) {
      this.showError(err instanceof Error ? err.message : 'Failed to load playlist');
      throw err;
    }
  }

  /**
   * Load post by index
   */
  private async loadPost(index: number): Promise<void> {
    if (index < 0 || index >= this.playlistUrls.length) return;
    if (!this.container) return;

    this.currentIndex = index;
    this.isLoading = true;
    const url = this.playlistUrls[index];

    // Check cache
    const cached = this.cache.get(url);
    if (cached) {
      this.currentPost = cached;
      this.renderPost();
      this.updateTocLabel(index);
      this.notifyPageChange();
      this.isLoading = false;
      this.preloadAdjacent();
      return;
    }

    // Show loading skeleton
    this.showLoadingSkeleton(index);

    try {
      const result = await fetchTumblrData(url, { customProxy: this.customProxy });
      this.currentPost = parseTumblrData(result, url);
      this.cache.set(url, this.currentPost);

      // Mark as cached in ToC
      if (this.cachedToc[index]) {
        this.cachedToc[index].isCached = true;
      }

      this.renderPost();
      this.updateTocLabel(index);
      this.notifyPageChange();
      this.preloadAdjacent();
    } catch (err) {
      this.showError(err instanceof Error ? err.message : 'Failed to load post');
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Update ToC label with actual post title after loading
   */
  private updateTocLabel(index: number): void {
    if (this.cachedToc[index] && this.currentPost?.title) {
      this.cachedToc[index].label = this.currentPost.title;
      this.onTocUpdateCallback?.();
    }
  }

  /**
   * Preload adjacent posts in background
   * Adapts preload strategy based on navigation direction
   */
  private preloadAdjacent(): void {
    // Cancel any pending prefetch requests
    if (this.prefetchAbortController) {
      this.prefetchAbortController.abort();
    }
    this.prefetchAbortController = new AbortController();
    const signal = this.prefetchAbortController.signal;

    // Determine navigation direction
    const goingForward = this.currentIndex >= this.lastIndex;
    this.lastIndex = this.currentIndex;

    // Prioritize preloading in the direction of travel
    // Forward: +1, +2, +3, -1
    // Backward: -1, -2, -3, +1
    const preloadIndices = goingForward
      ? [this.currentIndex + 1, this.currentIndex + 2, this.currentIndex + 3, this.currentIndex - 1]
      : [this.currentIndex - 1, this.currentIndex - 2, this.currentIndex - 3, this.currentIndex + 1];

    for (const idx of preloadIndices) {
      if (idx >= 0 && idx < this.playlistUrls.length) {
        const url = this.playlistUrls[idx];
        if (!this.cache.has(url)) {
          fetchTumblrData(url, { customProxy: this.customProxy, signal })
            .then(result => {
              const post = parseTumblrData(result, url);
              this.cache.set(url, post);
              this.notifyCacheUpdate(idx, post);
            })
            .catch((err) => {
              // Ignore abort and other preload errors
              if (err instanceof DOMException && err.name === 'AbortError') {
                return; // Expected when navigation changes
              }
              // Ignore other preload errors silently
            });
        }
      }
    }
  }

  /**
   * Notify when cache is updated for a post
   */
  private notifyCacheUpdate(index: number, post: TumblrPost): void {
    if (this.cachedToc[index]) {
      this.cachedToc[index].isCached = true;
      if (post.title) {
        this.cachedToc[index].label = post.title;
      }
      this.onTocUpdateCallback?.();
    }
  }

  /**
   * Navigate to next post
   */
  async next(): Promise<void> {
    if (this.isLoading) return;
    if (this.currentIndex < this.playlistUrls.length - 1) {
      await this.loadPost(this.currentIndex + 1);
    }
  }

  /**
   * Navigate to previous post
   */
  async prev(): Promise<void> {
    if (this.isLoading) return;
    if (this.currentIndex > 0) {
      await this.loadPost(this.currentIndex - 1);
    }
  }

  /**
   * Navigate to a specific page (1-indexed)
   */
  async goTo(page: number): Promise<void> {
    if (this.isLoading) return;
    const index = page - 1;
    if (index >= 0 && index < this.playlistUrls.length) {
      await this.loadPost(index);
    }
  }

  /**
   * Get table of contents
   */
  getToc(): TocItem[] {
    return this.cachedToc;
  }

  /**
   * Navigate to a ToC item
   */
  async goToTocItem(item: TocItem): Promise<void> {
    if (item.page) {
      await this.goTo(item.page);
    }
  }

  /**
   * Get navigation controls
   */
  getNavigation(): ReaderNavigation {
    return {
      currentPage: this.currentIndex + 1,
      totalPages: this.playlistUrls.length,
      next: () => this.next(),
      prev: () => this.prev(),
      goTo: (page: number) => this.goTo(page),
    };
  }

  /**
   * Check navigation availability
   */
  hasNavigation(): { canPrev: boolean; canNext: boolean } {
    return {
      canPrev: this.currentIndex > 0,
      canNext: this.currentIndex < this.playlistUrls.length - 1,
    };
  }

  /**
   * Get current post data
   */
  getCurrentPost(): TumblrPost | null {
    return this.currentPost;
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
   * Get total posts in playlist
   */
  getTotalPosts(): number {
    return this.playlistUrls.length;
  }

  /**
   * Check if all posts are cached
   */
  isAllCached(): boolean {
    return this.playlistUrls.every(url => this.cache.has(url));
  }

  /**
   * Check if currently prefetching
   */
  getIsPrefetching(): boolean {
    return this.isPrefetching;
  }

  /**
   * Get prefetch progress
   */
  getPrefetchProgress(): number {
    return this.prefetchProgress;
  }

  /**
   * Get the default EPUB title (blog name from first entry)
   */
  getDefaultEpubTitle(): string {
    if (this.playlistUrls.length > 0) {
      return extractBlogNameFromUrl(this.playlistUrls[0]);
    }
    return 'Tumblr Playlist';
  }

  /**
   * Prefetch all posts into cache
   */
  async prefetchAll(onProgress?: (current: number, total: number) => void): Promise<void> {
    if (this.isPrefetching) return;

    this.isPrefetching = true;
    this.prefetchProgress = 0;
    const CONCURRENCY = 4;

    try {
      for (let i = 0; i < this.playlistUrls.length; i += CONCURRENCY) {
        const batch = this.playlistUrls.slice(i, i + CONCURRENCY);

        await Promise.allSettled(
          batch.map(async (url, batchIdx) => {
            const idx = i + batchIdx;
            if (!this.cache.has(url)) {
              try {
                const result = await fetchTumblrData(url, { customProxy: this.customProxy });
                const post = parseTumblrData(result, url);
                this.cache.set(url, post);
                this.notifyCacheUpdate(idx, post);
              } catch {
                // Ignore individual failures
              }
            }
          })
        );

        this.prefetchProgress = Math.min(i + CONCURRENCY, this.playlistUrls.length);
        onProgress?.(this.prefetchProgress, this.playlistUrls.length);
      }
    } finally {
      this.isPrefetching = false;
    }
  }

  /**
   * Clear the post cache
   */
  clearCache(): void {
    this.cache.clear();
    // Update ToC cache status
    for (const item of this.cachedToc) {
      item.isCached = false;
    }
    this.onTocUpdateCallback?.();
  }

  /**
   * Set page change callback
   */
  setOnPageChange(callback: (page: number, total: number) => void): void {
    this.onPageChangeCallback = callback;
  }

  /**
   * Export all posts as EPUB with parallel fetching
   */
  async exportAsEpub(onProgress?: ProgressCallback, title?: string): Promise<Blob> {
    const CONCURRENCY = 4;
    const posts: TumblrPost[] = new Array(this.playlistUrls.length);

    // Fetch in parallel batches
    for (let i = 0; i < this.playlistUrls.length; i += CONCURRENCY) {
      const batch = this.playlistUrls.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(async (url, batchIdx) => {
          const idx = i + batchIdx;
          let post = this.cache.get(url);
          if (!post) {
            const result = await fetchTumblrData(url, { customProxy: this.customProxy });
            post = parseTumblrData(result, url);
            this.cache.set(url, post);
          }
          return { idx, post };
        })
      );

      // Collect successful fetches
      for (const result of results) {
        if (result.status === 'fulfilled') {
          posts[result.value.idx] = result.value.post;
        }
      }

      onProgress?.({
        stage: 'collecting',
        current: Math.min(i + CONCURRENCY, this.playlistUrls.length),
        total: this.playlistUrls.length,
        message: `Fetching posts... ${Math.min(i + CONCURRENCY, this.playlistUrls.length)}/${this.playlistUrls.length}`,
      });
    }

    // Filter out any failed posts
    const validPosts = posts.filter(Boolean);
    // Default title is the blog name from the first entry
    const defaultTitle = this.playlistUrls.length > 0
      ? extractBlogNameFromUrl(this.playlistUrls[0])
      : 'Tumblr Playlist';
    const epubTitle = title || defaultTitle;
    return generateEpub(validPosts, epubTitle, onProgress);
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.cleanupKeyboardNav) {
      this.cleanupKeyboardNav();
      this.cleanupKeyboardNav = null;
    }

    // Abort any pending prefetch requests
    if (this.prefetchAbortController) {
      this.prefetchAbortController.abort();
      this.prefetchAbortController = null;
    }

    this.container = null;
    this.currentPost = null;
    this.playlistUrls = [];
    this.cachedToc = [];
    this.currentIndex = 0;
    this.onPageChangeCallback = undefined;
    this.onTocUpdateCallback = undefined;
  }

  /**
   * Notify about page change
   */
  private notifyPageChange(): void {
    if (this.onPageChangeCallback) {
      this.onPageChangeCallback(this.currentIndex + 1, this.playlistUrls.length);
    }
  }

  /**
   * Set up keyboard navigation
   */
  private setupKeyboardNavigation(): void {
    this.cleanupKeyboardNav = setupKeyboardNavigation({
      onNext: () => {
        if (this.hasNavigation().canNext) this.next();
      },
      onPrev: () => {
        if (this.hasNavigation().canPrev) this.prev();
      },
      canNavigate: () => !this.isLoading,
    });
  }

  /**
   * Show loading skeleton
   */
  private showLoadingSkeleton(index: number): void {
    if (!this.container) return;
    this.container.innerHTML = createSkeletonHtml(index + 1, this.playlistUrls.length);
  }

  /**
   * Show loading indicator
   */
  private showLoading(message: string): void {
    if (!this.container) return;
    this.container.innerHTML = createLoadingHtml(message);
  }

  /**
   * Show error message
   */
  private showError(message: string): void {
    if (!this.container) return;
    this.container.innerHTML = createErrorHtml(message);
    setupRetryListener(this.container, () => {
      this.loadPost(this.currentIndex);
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
      ? `<div class="tumblr-reblog-trail">${post.reblogTrail.map(entry => renderReblogEntry(entry)).join('')}</div>`
      : '';

    // Build main content HTML
    const contentHtml = post.content.map(block => renderBlock(block)).join('');

    // Title
    const titleHtml = post.title
      ? `<h1 class="tumblr-title">${escapeHtml(post.title)}</h1>`
      : '';

    // Tags
    const tagsHtml = post.tags.length > 0
      ? `<div class="tumblr-tags">${post.tags.map(t => `<span class="tumblr-tag">#${escapeHtml(t)}</span>`).join(' ')}</div>`
      : '';

    this.container.innerHTML = `
      <article class="tumblr-post">
        ${titleHtml}
        ${trailHtml}
        <div class="tumblr-content">
          <div class="tumblr-author">
            <a href="${escapeHtml(post.blogUrl)}" target="_blank" rel="noopener">
              <strong>${escapeHtml(post.blogName)}</strong>
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

}
