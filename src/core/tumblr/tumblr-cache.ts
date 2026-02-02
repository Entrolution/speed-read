/**
 * Two-tier caching for Tumblr posts
 * Memory cache for fast access, localStorage for persistence
 */

import type { TumblrPost } from '@/types';

interface CachedPost {
  post: TumblrPost;
  fetchedAt: number;
}

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const STORAGE_KEY = 'speed-reader-tumblr-cache';
const MAX_CACHED_POSTS = 50;

export class TumblrCache {
  private memoryCache: Map<string, CachedPost> = new Map();

  /**
   * Get a cached post by URL
   * Checks memory first, then localStorage
   */
  get(url: string): TumblrPost | null {
    const normalizedUrl = this.normalizeUrl(url);

    // Check memory cache
    const memoryCached = this.memoryCache.get(normalizedUrl);
    if (memoryCached && !this.isExpired(memoryCached)) {
      return memoryCached.post;
    }

    // Check localStorage
    const stored = this.loadFromStorage(normalizedUrl);
    if (stored && !this.isExpired(stored)) {
      // Promote to memory cache
      this.memoryCache.set(normalizedUrl, stored);
      return stored.post;
    }

    // Clean up expired entries
    if (memoryCached) {
      this.memoryCache.delete(normalizedUrl);
    }

    return null;
  }

  /**
   * Store a post in both memory and localStorage
   */
  set(url: string, post: TumblrPost): void {
    const normalizedUrl = this.normalizeUrl(url);
    const cached: CachedPost = {
      post,
      fetchedAt: Date.now(),
    };

    this.memoryCache.set(normalizedUrl, cached);
    this.saveToStorage(normalizedUrl, cached);
  }

  /**
   * Check if a URL is cached (without loading the full post)
   */
  has(url: string): boolean {
    const normalizedUrl = this.normalizeUrl(url);
    return this.memoryCache.has(normalizedUrl) || this.loadFromStorage(normalizedUrl) !== null;
  }

  /**
   * Get all non-expired cached posts
   */
  getAllCached(): TumblrPost[] {
    // Merge memory and localStorage caches
    this.loadAllFromStorage();

    return Array.from(this.memoryCache.values())
      .filter(c => !this.isExpired(c))
      .sort((a, b) => a.post.timestamp - b.post.timestamp)
      .map(c => c.post);
  }

  /**
   * Clear all cached posts
   */
  clear(): void {
    this.memoryCache.clear();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // localStorage may not be available
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): { memoryCount: number; storageCount: number } {
    let storageCount = 0;
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        const cache = JSON.parse(data);
        storageCount = Object.keys(cache).length;
      }
    } catch {
      // Ignore errors
    }

    return {
      memoryCount: this.memoryCache.size,
      storageCount,
    };
  }

  /**
   * Normalize URL for consistent cache keys
   */
  private normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      // Remove trailing slashes and normalize
      return urlObj.origin + urlObj.pathname.replace(/\/+$/, '');
    } catch {
      return url;
    }
  }

  /**
   * Check if a cached entry is expired
   */
  private isExpired(cached: CachedPost): boolean {
    return Date.now() - cached.fetchedAt > CACHE_TTL;
  }

  /**
   * Load a single entry from localStorage
   */
  private loadFromStorage(url: string): CachedPost | null {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return null;

      const cache = JSON.parse(data) as Record<string, CachedPost>;
      return cache[url] ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Load all entries from localStorage into memory
   */
  private loadAllFromStorage(): void {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return;

      const cache = JSON.parse(data) as Record<string, CachedPost>;
      for (const [url, cached] of Object.entries(cache)) {
        if (!this.memoryCache.has(url) && !this.isExpired(cached)) {
          this.memoryCache.set(url, cached);
        }
      }
    } catch {
      // Ignore errors
    }
  }

  /**
   * Save an entry to localStorage
   */
  private saveToStorage(url: string, cached: CachedPost): void {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      const cache: Record<string, CachedPost> = data ? JSON.parse(data) : {};

      cache[url] = cached;

      // Prune old entries (keep most recent MAX_CACHED_POSTS)
      const urls = Object.keys(cache);
      if (urls.length > MAX_CACHED_POSTS) {
        const sortedUrls = urls.sort((a, b) => {
          const aTime = cache[a].fetchedAt;
          const bTime = cache[b].fetchedAt;
          return aTime - bTime;
        });

        // Remove oldest entries
        const toRemove = sortedUrls.slice(0, urls.length - MAX_CACHED_POSTS);
        for (const oldUrl of toRemove) {
          delete cache[oldUrl];
        }
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    } catch {
      // localStorage may be full or unavailable
      // Try to clear old entries and retry
      try {
        this.pruneStorage();
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ [url]: cached }));
      } catch {
        // Give up - operate in memory-only mode
      }
    }
  }

  /**
   * Prune expired entries from localStorage
   */
  private pruneStorage(): void {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return;

      const cache = JSON.parse(data) as Record<string, CachedPost>;
      const pruned: Record<string, CachedPost> = {};

      for (const [url, cached] of Object.entries(cache)) {
        if (!this.isExpired(cached)) {
          pruned[url] = cached;
        }
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
    } catch {
      // If all else fails, clear the cache
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Ignore
      }
    }
  }
}
