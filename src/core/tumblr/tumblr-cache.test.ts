import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TumblrCache } from './tumblr-cache';
import type { TumblrPost } from '@/types';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
});

const createMockPost = (id: string): TumblrPost => ({
  id,
  title: `Post ${id}`,
  content: [{ type: 'text', text: 'Test content' }],
  reblogTrail: [],
  blogName: 'test-blog',
  blogUrl: 'https://test-blog.tumblr.com',
  timestamp: Date.now() / 1000,
  tags: ['test'],
});

describe('TumblrCache', () => {
  let cache: TumblrCache;

  beforeEach(() => {
    cache = new TumblrCache();
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cache.clear();
  });

  describe('set and get', () => {
    it('should store and retrieve a post', () => {
      const post = createMockPost('1');
      const url = 'https://www.tumblr.com/test-blog/123';

      cache.set(url, post);
      const retrieved = cache.get(url);

      expect(retrieved).toEqual(post);
    });

    it('should normalize URLs before storing', () => {
      const post = createMockPost('1');
      const url1 = 'https://www.tumblr.com/test-blog/123/';
      const url2 = 'https://www.tumblr.com/test-blog/123';

      cache.set(url1, post);
      const retrieved = cache.get(url2);

      expect(retrieved).toEqual(post);
    });

    it('should return null for uncached URLs', () => {
      const result = cache.get('https://www.tumblr.com/nonexistent/123');
      expect(result).toBeNull();
    });

    it('should save to localStorage', () => {
      const post = createMockPost('1');
      const url = 'https://www.tumblr.com/test-blog/123';

      cache.set(url, post);

      expect(localStorageMock.setItem).toHaveBeenCalled();
    });
  });

  describe('has', () => {
    it('should return true for cached URLs', () => {
      const post = createMockPost('1');
      const url = 'https://www.tumblr.com/test-blog/123';

      cache.set(url, post);

      expect(cache.has(url)).toBe(true);
    });

    it('should return false for uncached URLs', () => {
      expect(cache.has('https://www.tumblr.com/nonexistent/123')).toBe(false);
    });
  });

  describe('getAllCached', () => {
    it('should return all cached posts', () => {
      const post1 = createMockPost('1');
      const post2 = createMockPost('2');

      cache.set('https://www.tumblr.com/test/1', post1);
      cache.set('https://www.tumblr.com/test/2', post2);

      const all = cache.getAllCached();

      expect(all).toHaveLength(2);
      expect(all).toContainEqual(post1);
      expect(all).toContainEqual(post2);
    });

    it('should return empty array when no posts cached', () => {
      const all = cache.getAllCached();
      expect(all).toEqual([]);
    });
  });

  describe('clear', () => {
    it('should remove all cached posts', () => {
      const post = createMockPost('1');
      cache.set('https://www.tumblr.com/test/1', post);

      cache.clear();

      expect(cache.get('https://www.tumblr.com/test/1')).toBeNull();
      expect(cache.getAllCached()).toEqual([]);
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', () => {
      const post = createMockPost('1');
      cache.set('https://www.tumblr.com/test/1', post);

      const stats = cache.getStats();

      expect(stats.memoryCount).toBe(1);
      expect(stats.storageCount).toBeGreaterThanOrEqual(0);
    });
  });
});
