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
  /** Parsed localStorage cache to avoid re-parsing on every read */
  private parsedStorageCache: Record<string, CachedPost> | null = null;
  /** Flag to track if storage cache is dirty and needs to be synced */
  private storageDirty = false;

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
    this.parsedStorageCache = {};
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
      this.ensureParsedCache();
      storageCount = Object.keys(this.parsedStorageCache!).length;
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
   * Uses parsed cache to avoid re-parsing on every read
   */
  private loadFromStorage(url: string): CachedPost | null {
    try {
      this.ensureParsedCache();
      return this.parsedStorageCache![url] ?? null;
    } catch {
      this.parsedStorageCache = {};
      return null;
    }
  }

  /**
   * Load all entries from localStorage into memory
   * Uses parsed cache to avoid re-parsing
   */
  private loadAllFromStorage(): void {
    try {
      this.ensureParsedCache();

      for (const [url, cached] of Object.entries(this.parsedStorageCache!)) {
        if (!this.memoryCache.has(url) && !this.isExpired(cached)) {
          this.memoryCache.set(url, cached);
        }
      }
    } catch {
      this.parsedStorageCache = {};
    }
  }

  /**
   * Save an entry to localStorage
   * Updates both localStorage and the parsed cache
   */
  private saveToStorage(url: string, cached: CachedPost): void {
    try {
      // Initialize parsed cache if needed
      this.ensureParsedCache();
      const cache = this.parsedStorageCache!;

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
        this.parsedStorageCache = { [url]: cached };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.parsedStorageCache));
      } catch {
        // Give up - operate in memory-only mode
        this.parsedStorageCache = { [url]: cached };
      }
    }
  }

  /**
   * Ensure parsed cache is initialized
   */
  private ensureParsedCache(): void {
    if (this.parsedStorageCache === null) {
      try {
        const data = localStorage.getItem(STORAGE_KEY);
        this.parsedStorageCache = data ? JSON.parse(data) : {};
      } catch {
        this.parsedStorageCache = {};
      }
    }
  }

  /**
   * Prune expired entries from localStorage
   * Updates both localStorage and the parsed cache
   */
  private pruneStorage(): void {
    try {
      this.ensureParsedCache();

      const pruned: Record<string, CachedPost> = {};

      for (const [url, cached] of Object.entries(this.parsedStorageCache!)) {
        if (!this.isExpired(cached)) {
          pruned[url] = cached;
        }
      }

      this.parsedStorageCache = pruned;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
    } catch {
      // If all else fails, clear the cache
      this.parsedStorageCache = {};
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Ignore
      }
    }
  }
}
