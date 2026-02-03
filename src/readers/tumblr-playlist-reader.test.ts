import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TumblrPlaylistReader } from './tumblr-playlist-reader';
import type { TumblrPost } from '@/types';

// Mock the tumblr module
vi.mock('@/core/tumblr', () => ({
  fetchTumblrData: vi.fn(),
  parseTumblrData: vi.fn(),
  fetchViaCorsProxy: vi.fn(),
  TumblrCache: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
    has: vi.fn().mockReturnValue(false),
    getAllCached: vi.fn().mockReturnValue([]),
    clear: vi.fn(),
  })),
  generateEpub: vi.fn().mockResolvedValue(new Blob(['test'])),
  renderBlock: vi.fn().mockReturnValue('<p>content</p>'),
  renderReblogEntry: vi.fn().mockReturnValue('<div>reblog</div>'),
}));

// Mock playlist parser
vi.mock('@/core/tumblr/playlist-parser', () => ({
  getGoogleDocExportUrl: vi.fn((url: string) => `${url}/export`),
  extractTumblrUrls: vi.fn(),
  extractLabelFromUrl: vi.fn((url: string) => `Label for ${url}`),
  extractBlogNameFromUrl: vi.fn().mockReturnValue('test-blog'),
}));

// Mock utils
vi.mock('@/core/utils', () => ({
  escapeHtml: vi.fn((text: string) => text),
  createLoadingHtml: vi.fn().mockReturnValue('<div>Loading...</div>'),
  createErrorHtml: vi.fn().mockReturnValue('<div>Error</div>'),
  createSkeletonHtml: vi.fn().mockReturnValue('<div>Skeleton</div>'),
  setupRetryListener: vi.fn(),
  setupKeyboardNavigation: vi.fn().mockReturnValue(() => {}),
}));

// Import mocked modules
import { fetchTumblrData, parseTumblrData, fetchViaCorsProxy, TumblrCache, generateEpub } from '@/core/tumblr';
import { extractTumblrUrls } from '@/core/tumblr/playlist-parser';

const mockFetchTumblrData = fetchTumblrData as ReturnType<typeof vi.fn>;
const mockParseTumblrData = parseTumblrData as ReturnType<typeof vi.fn>;
const mockFetchViaCorsProxy = fetchViaCorsProxy as ReturnType<typeof vi.fn>;
const mockExtractTumblrUrls = extractTumblrUrls as ReturnType<typeof vi.fn>;
const mockGenerateEpub = generateEpub as ReturnType<typeof vi.fn>;

// Helper to create a mock post
function createMockPost(overrides: Partial<TumblrPost> = {}): TumblrPost {
  return {
    id: '123456789',
    blogName: 'test-blog',
    blogUrl: 'https://test-blog.tumblr.com',
    content: [{ type: 'text', text: 'Test content' }],
    reblogTrail: [],
    tags: ['tag1', 'tag2'],
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('TumblrPlaylistReader', () => {
  let reader: TumblrPlaylistReader;
  let container: HTMLElement;

  beforeEach(() => {
    reader = new TumblrPlaylistReader();
    container = document.createElement('div');
    vi.clearAllMocks();
  });

  afterEach(() => {
    reader.destroy();
  });

  describe('load()', () => {
    it('should throw error when called directly', async () => {
      await expect(reader.load(new ArrayBuffer(0), container))
        .rejects.toThrow('TumblrPlaylistReader must be loaded via loadFromPlaylist()');
    });
  });

  describe('loadFromPlaylist()', () => {
    it('should load playlist and first post successfully', async () => {
      const urls = [
        'https://www.tumblr.com/blog1/111',
        'https://www.tumblr.com/blog1/222',
        'https://www.tumblr.com/blog1/333',
      ];
      const mockPost = createMockPost();

      mockFetchViaCorsProxy.mockResolvedValue('<html>doc content</html>');
      mockExtractTumblrUrls.mockReturnValue(urls);
      mockFetchTumblrData.mockResolvedValue({ type: 'api', data: {} });
      mockParseTumblrData.mockReturnValue(mockPost);

      await reader.loadFromPlaylist('https://docs.google.com/document/d/123', container);

      expect(mockFetchViaCorsProxy).toHaveBeenCalled();
      expect(mockExtractTumblrUrls).toHaveBeenCalled();
      expect(reader.getTotalPosts()).toBe(3);
      expect(reader.getCurrentPost()).toEqual(mockPost);
    });

    it('should throw error when no URLs found', async () => {
      mockFetchViaCorsProxy.mockResolvedValue('<html>no links</html>');
      mockExtractTumblrUrls.mockReturnValue([]);

      await expect(reader.loadFromPlaylist('https://docs.google.com/document/d/123', container))
        .rejects.toThrow('No Tumblr URLs found in the document');
    });

    it('should call onPageChange callback', async () => {
      const urls = ['https://www.tumblr.com/blog1/111'];
      const mockPost = createMockPost();

      mockFetchViaCorsProxy.mockResolvedValue('<html>doc</html>');
      mockExtractTumblrUrls.mockReturnValue(urls);
      mockFetchTumblrData.mockResolvedValue({ type: 'api', data: {} });
      mockParseTumblrData.mockReturnValue(mockPost);

      const onPageChange = vi.fn();
      await reader.loadFromPlaylist('https://docs.google.com/document/d/123', container, {
        onPageChange,
      });

      expect(onPageChange).toHaveBeenCalledWith(1, 1);
    });

    it('should use custom proxy when provided', async () => {
      const urls = ['https://www.tumblr.com/blog1/111'];
      const mockPost = createMockPost();

      mockFetchViaCorsProxy.mockResolvedValue('<html>doc</html>');
      mockExtractTumblrUrls.mockReturnValue(urls);
      mockFetchTumblrData.mockResolvedValue({ type: 'api', data: {} });
      mockParseTumblrData.mockReturnValue(mockPost);

      await reader.loadFromPlaylist('https://docs.google.com/document/d/123', container, {
        customProxy: 'https://my-proxy.com/?url=',
      });

      expect(mockFetchViaCorsProxy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ customProxy: 'https://my-proxy.com/?url=' })
      );
    });
  });

  describe('navigation', () => {
    beforeEach(async () => {
      const urls = [
        'https://www.tumblr.com/blog1/111',
        'https://www.tumblr.com/blog1/222',
        'https://www.tumblr.com/blog1/333',
      ];
      const mockPost = createMockPost();

      mockFetchViaCorsProxy.mockResolvedValue('<html>doc</html>');
      mockExtractTumblrUrls.mockReturnValue(urls);
      mockFetchTumblrData.mockResolvedValue({ type: 'api', data: {} });
      mockParseTumblrData.mockReturnValue(mockPost);

      await reader.loadFromPlaylist('https://docs.google.com/document/d/123', container);
    });

    describe('next()', () => {
      it('should navigate to next post', async () => {
        const nextPost = createMockPost({ id: '222' });
        mockParseTumblrData.mockReturnValue(nextPost);

        await reader.next();

        expect(reader.getNavigation().currentPage).toBe(2);
      });

      it('should not navigate past last post', async () => {
        await reader.goTo(3); // Go to last post

        const initialPage = reader.getNavigation().currentPage;
        await reader.next();

        expect(reader.getNavigation().currentPage).toBe(initialPage);
      });
    });

    describe('prev()', () => {
      it('should navigate to previous post', async () => {
        const post2 = createMockPost({ id: '222' });
        mockParseTumblrData.mockReturnValue(post2);
        await reader.next();

        const post1 = createMockPost({ id: '111' });
        mockParseTumblrData.mockReturnValue(post1);
        await reader.prev();

        expect(reader.getNavigation().currentPage).toBe(1);
      });

      it('should not navigate before first post', async () => {
        await reader.prev();

        expect(reader.getNavigation().currentPage).toBe(1);
      });
    });

    describe('goTo()', () => {
      it('should navigate to specific page', async () => {
        const post3 = createMockPost({ id: '333' });
        mockParseTumblrData.mockReturnValue(post3);

        await reader.goTo(3);

        expect(reader.getNavigation().currentPage).toBe(3);
      });

      it('should not navigate to invalid page', async () => {
        await reader.goTo(0);
        expect(reader.getNavigation().currentPage).toBe(1);

        await reader.goTo(100);
        expect(reader.getNavigation().currentPage).toBe(1);
      });
    });
  });

  describe('getToc()', () => {
    it('should return ToC items for all playlist URLs', async () => {
      const urls = [
        'https://www.tumblr.com/blog1/111',
        'https://www.tumblr.com/blog1/222',
      ];
      const mockPost = createMockPost();

      mockFetchViaCorsProxy.mockResolvedValue('<html>doc</html>');
      mockExtractTumblrUrls.mockReturnValue(urls);
      mockFetchTumblrData.mockResolvedValue({ type: 'api', data: {} });
      mockParseTumblrData.mockReturnValue(mockPost);

      await reader.loadFromPlaylist('https://docs.google.com/document/d/123', container);

      const toc = reader.getToc();
      expect(toc).toHaveLength(2);
      expect(toc[0].page).toBe(1);
      expect(toc[1].page).toBe(2);
    });
  });

  describe('goToTocItem()', () => {
    it('should navigate to ToC item page', async () => {
      const urls = [
        'https://www.tumblr.com/blog1/111',
        'https://www.tumblr.com/blog1/222',
      ];
      const mockPost = createMockPost();

      mockFetchViaCorsProxy.mockResolvedValue('<html>doc</html>');
      mockExtractTumblrUrls.mockReturnValue(urls);
      mockFetchTumblrData.mockResolvedValue({ type: 'api', data: {} });
      mockParseTumblrData.mockReturnValue(mockPost);

      await reader.loadFromPlaylist('https://docs.google.com/document/d/123', container);

      const toc = reader.getToc();
      await reader.goToTocItem(toc[1]);

      expect(reader.getNavigation().currentPage).toBe(2);
    });
  });

  describe('hasNavigation()', () => {
    it('should return correct navigation availability', async () => {
      const urls = [
        'https://www.tumblr.com/blog1/111',
        'https://www.tumblr.com/blog1/222',
        'https://www.tumblr.com/blog1/333',
      ];
      const mockPost = createMockPost();

      mockFetchViaCorsProxy.mockResolvedValue('<html>doc</html>');
      mockExtractTumblrUrls.mockReturnValue(urls);
      mockFetchTumblrData.mockResolvedValue({ type: 'api', data: {} });
      mockParseTumblrData.mockReturnValue(mockPost);

      await reader.loadFromPlaylist('https://docs.google.com/document/d/123', container);

      // At first post
      expect(reader.hasNavigation()).toEqual({ canPrev: false, canNext: true });

      // Go to middle
      await reader.next();
      expect(reader.hasNavigation()).toEqual({ canPrev: true, canNext: true });

      // Go to last
      await reader.goTo(3);
      expect(reader.hasNavigation()).toEqual({ canPrev: true, canNext: false });
    });
  });

  describe('getBlogName()', () => {
    it('should return blog name from current post', async () => {
      const urls = ['https://www.tumblr.com/my-blog/111'];
      const mockPost = createMockPost({ blogName: 'my-blog' });

      mockFetchViaCorsProxy.mockResolvedValue('<html>doc</html>');
      mockExtractTumblrUrls.mockReturnValue(urls);
      mockFetchTumblrData.mockResolvedValue({ type: 'api', data: {} });
      mockParseTumblrData.mockReturnValue(mockPost);

      await reader.loadFromPlaylist('https://docs.google.com/document/d/123', container);

      expect(reader.getBlogName()).toBe('my-blog');
    });
  });

  describe('prefetchAll()', () => {
    it('should prefetch all posts with progress', async () => {
      const urls = [
        'https://www.tumblr.com/blog1/111',
        'https://www.tumblr.com/blog1/222',
      ];
      const mockPost = createMockPost();

      mockFetchViaCorsProxy.mockResolvedValue('<html>doc</html>');
      mockExtractTumblrUrls.mockReturnValue(urls);
      mockFetchTumblrData.mockResolvedValue({ type: 'api', data: {} });
      mockParseTumblrData.mockReturnValue(mockPost);

      await reader.loadFromPlaylist('https://docs.google.com/document/d/123', container);

      const onProgress = vi.fn();
      await reader.prefetchAll(onProgress);

      expect(onProgress).toHaveBeenCalled();
      expect(reader.getIsPrefetching()).toBe(false);
    });

    it('should not run multiple prefetches simultaneously', async () => {
      const urls = ['https://www.tumblr.com/blog1/111'];
      const mockPost = createMockPost();

      mockFetchViaCorsProxy.mockResolvedValue('<html>doc</html>');
      mockExtractTumblrUrls.mockReturnValue(urls);
      mockFetchTumblrData.mockResolvedValue({ type: 'api', data: {} });
      mockParseTumblrData.mockReturnValue(mockPost);

      await reader.loadFromPlaylist('https://docs.google.com/document/d/123', container);

      // Start prefetch but don't await
      const prefetch1 = reader.prefetchAll();
      const prefetch2 = reader.prefetchAll();

      await prefetch1;
      await prefetch2;

      // Only one prefetch should have run
      expect(reader.getIsPrefetching()).toBe(false);
    });
  });

  describe('clearCache()', () => {
    it('should clear cache and update ToC', async () => {
      const urls = ['https://www.tumblr.com/blog1/111'];
      const mockPost = createMockPost();

      const mockCache = {
        get: vi.fn().mockReturnValue(null),
        set: vi.fn(),
        has: vi.fn().mockReturnValue(false),
        getAllCached: vi.fn().mockReturnValue([]),
        clear: vi.fn(),
      };
      (TumblrCache as ReturnType<typeof vi.fn>).mockImplementation(() => mockCache);

      const newReader = new TumblrPlaylistReader();
      mockFetchViaCorsProxy.mockResolvedValue('<html>doc</html>');
      mockExtractTumblrUrls.mockReturnValue(urls);
      mockFetchTumblrData.mockResolvedValue({ type: 'api', data: {} });
      mockParseTumblrData.mockReturnValue(mockPost);

      const onTocUpdate = vi.fn();
      await newReader.loadFromPlaylist('https://docs.google.com/document/d/123', container, {
        onTocUpdate,
      });

      newReader.clearCache();

      expect(mockCache.clear).toHaveBeenCalled();
      expect(onTocUpdate).toHaveBeenCalled();

      newReader.destroy();
    });
  });

  describe('exportAsEpub()', () => {
    it('should export posts as EPUB', async () => {
      const urls = ['https://www.tumblr.com/blog1/111'];
      const mockPost = createMockPost();

      mockFetchViaCorsProxy.mockResolvedValue('<html>doc</html>');
      mockExtractTumblrUrls.mockReturnValue(urls);
      mockFetchTumblrData.mockResolvedValue({ type: 'api', data: {} });
      mockParseTumblrData.mockReturnValue(mockPost);

      await reader.loadFromPlaylist('https://docs.google.com/document/d/123', container);

      const onProgress = vi.fn();
      const blob = await reader.exportAsEpub(onProgress, 'My Export');

      expect(mockGenerateEpub).toHaveBeenCalled();
      expect(blob).toBeInstanceOf(Blob);
    });
  });

  describe('getDefaultEpubTitle()', () => {
    it('should return blog name from first URL', async () => {
      const urls = ['https://www.tumblr.com/blog1/111'];
      const mockPost = createMockPost();

      mockFetchViaCorsProxy.mockResolvedValue('<html>doc</html>');
      mockExtractTumblrUrls.mockReturnValue(urls);
      mockFetchTumblrData.mockResolvedValue({ type: 'api', data: {} });
      mockParseTumblrData.mockReturnValue(mockPost);

      await reader.loadFromPlaylist('https://docs.google.com/document/d/123', container);

      expect(reader.getDefaultEpubTitle()).toBe('test-blog');
    });
  });

  describe('destroy()', () => {
    it('should clean up resources', async () => {
      const urls = ['https://www.tumblr.com/blog1/111'];
      const mockPost = createMockPost();

      mockFetchViaCorsProxy.mockResolvedValue('<html>doc</html>');
      mockExtractTumblrUrls.mockReturnValue(urls);
      mockFetchTumblrData.mockResolvedValue({ type: 'api', data: {} });
      mockParseTumblrData.mockReturnValue(mockPost);

      await reader.loadFromPlaylist('https://docs.google.com/document/d/123', container);

      reader.destroy();

      expect(reader.getCurrentPost()).toBeNull();
      expect(reader.getTotalPosts()).toBe(0);
    });
  });
});
