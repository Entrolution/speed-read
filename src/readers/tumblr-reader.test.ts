import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TumblrReader } from './tumblr-reader';
import type { TumblrPost } from '@/types';

// Mock the tumblr module
vi.mock('@/core/tumblr', () => ({
  fetchTumblrData: vi.fn(),
  parseTumblrData: vi.fn(),
  TumblrCache: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
    getAllCached: vi.fn().mockReturnValue([]),
    clear: vi.fn(),
  })),
  generateEpub: vi.fn().mockResolvedValue(new Blob(['test'])),
  renderBlock: vi.fn().mockReturnValue('<p>content</p>'),
  renderReblogEntry: vi.fn().mockReturnValue('<div>reblog</div>'),
}));

// Mock utils
vi.mock('@/core/utils', () => ({
  escapeHtml: vi.fn((text: string) => text),
  createLoadingHtml: vi.fn().mockReturnValue('<div>Loading...</div>'),
  createErrorHtml: vi.fn().mockReturnValue('<div>Error</div>'),
  setupRetryListener: vi.fn(),
  setupKeyboardNavigation: vi.fn().mockReturnValue(() => {}),
}));

// Import mocked modules
import { fetchTumblrData, parseTumblrData, TumblrCache } from '@/core/tumblr';

const mockFetchTumblrData = fetchTumblrData as ReturnType<typeof vi.fn>;
const mockParseTumblrData = parseTumblrData as ReturnType<typeof vi.fn>;

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

describe('TumblrReader', () => {
  let reader: TumblrReader;
  let container: HTMLElement;

  beforeEach(() => {
    reader = new TumblrReader();
    container = document.createElement('div');
    vi.clearAllMocks();
  });

  afterEach(() => {
    reader.destroy();
  });

  describe('load()', () => {
    it('should throw error when called directly', async () => {
      await expect(reader.load(new ArrayBuffer(0), container))
        .rejects.toThrow('TumblrReader must be loaded via loadFromUrl()');
    });
  });

  describe('loadFromUrl()', () => {
    it('should load a post successfully', async () => {
      const mockPost = createMockPost();
      mockFetchTumblrData.mockResolvedValue({ type: 'api', data: {} });
      mockParseTumblrData.mockReturnValue(mockPost);

      await reader.loadFromUrl('https://www.tumblr.com/test-blog/123', container);

      expect(mockFetchTumblrData).toHaveBeenCalledWith('https://www.tumblr.com/test-blog/123', {
        customProxy: undefined,
      });
      expect(reader.getCurrentPost()).toEqual(mockPost);
    });

    it('should use custom proxy when provided', async () => {
      const mockPost = createMockPost();
      mockFetchTumblrData.mockResolvedValue({ type: 'api', data: {} });
      mockParseTumblrData.mockReturnValue(mockPost);

      await reader.loadFromUrl('https://www.tumblr.com/test-blog/123', container, {
        customProxy: 'https://my-proxy.com/?url=',
      });

      expect(mockFetchTumblrData).toHaveBeenCalledWith('https://www.tumblr.com/test-blog/123', {
        customProxy: 'https://my-proxy.com/?url=',
      });
    });

    it('should call onPageChange callback', async () => {
      const mockPost = createMockPost();
      mockFetchTumblrData.mockResolvedValue({ type: 'api', data: {} });
      mockParseTumblrData.mockReturnValue(mockPost);

      const onPageChange = vi.fn();
      await reader.loadFromUrl('https://www.tumblr.com/test-blog/123', container, {
        onPageChange,
      });

      expect(onPageChange).toHaveBeenCalledWith(1, 1);
    });

    it('should handle fetch errors gracefully', async () => {
      mockFetchTumblrData.mockRejectedValue(new Error('Network error'));

      await reader.loadFromUrl('https://www.tumblr.com/test-blog/123', container);

      expect(reader.getCurrentPost()).toBeNull();
      expect(container.innerHTML).toContain('Error');
    });

    it('should initialize history with starting URL', async () => {
      const mockPost = createMockPost();
      mockFetchTumblrData.mockResolvedValue({ type: 'api', data: {} });
      mockParseTumblrData.mockReturnValue(mockPost);

      await reader.loadFromUrl('https://www.tumblr.com/test-blog/123', container);

      const nav = reader.getNavigation();
      expect(nav.currentPage).toBe(1);
      expect(nav.totalPages).toBe(1);
    });
  });

  describe('navigation', () => {
    beforeEach(async () => {
      const mockPost = createMockPost({
        nextPostUrl: 'https://www.tumblr.com/test-blog/456',
        prevPostUrl: 'https://www.tumblr.com/test-blog/111',
      });
      mockFetchTumblrData.mockResolvedValue({ type: 'api', data: {} });
      mockParseTumblrData.mockReturnValue(mockPost);

      await reader.loadFromUrl('https://www.tumblr.com/test-blog/123', container);
    });

    describe('next()', () => {
      it('should navigate to next post', async () => {
        const nextPost = createMockPost({ id: '456' });
        mockParseTumblrData.mockReturnValue(nextPost);

        await reader.next();

        expect(mockFetchTumblrData).toHaveBeenLastCalledWith(
          'https://www.tumblr.com/test-blog/456',
          expect.any(Object)
        );
        expect(reader.getCurrentPost()?.id).toBe('456');
      });

      it('should update history when navigating next', async () => {
        const nextPost = createMockPost({ id: '456' });
        mockParseTumblrData.mockReturnValue(nextPost);

        await reader.next();

        const nav = reader.getNavigation();
        expect(nav.currentPage).toBe(2);
        expect(nav.totalPages).toBe(2);
      });

      it('should not navigate if no next URL', async () => {
        const postWithoutNext = createMockPost({ nextPostUrl: undefined });
        mockParseTumblrData.mockReturnValue(postWithoutNext);
        await reader.loadFromUrl('https://www.tumblr.com/test-blog/999', container);

        const initialCallCount = mockFetchTumblrData.mock.calls.length;
        await reader.next();

        expect(mockFetchTumblrData).toHaveBeenCalledTimes(initialCallCount);
      });
    });

    describe('prev()', () => {
      it('should go back through history first', async () => {
        // Navigate forward first
        const nextPost = createMockPost({ id: '456' });
        mockParseTumblrData.mockReturnValue(nextPost);
        await reader.next();

        // Now go back
        const originalPost = createMockPost({ id: '123' });
        mockParseTumblrData.mockReturnValue(originalPost);
        await reader.prev();

        const nav = reader.getNavigation();
        expect(nav.currentPage).toBe(1);
      });

      it('should use prevPostUrl when at start of history', async () => {
        // First post has prevPostUrl
        const prevPost = createMockPost({ id: '111' });
        mockParseTumblrData.mockReturnValue(prevPost);

        await reader.prev();

        expect(mockFetchTumblrData).toHaveBeenLastCalledWith(
          'https://www.tumblr.com/test-blog/111',
          expect.any(Object)
        );
      });
    });

    describe('goTo()', () => {
      it('should navigate to specific page in history', async () => {
        // Build up history
        const post2 = createMockPost({ id: '456' });
        const post3 = createMockPost({ id: '789' });
        mockParseTumblrData
          .mockReturnValueOnce(post2)
          .mockReturnValueOnce(post3);

        await reader.next();
        await reader.next();

        // Go back to page 1
        const post1 = createMockPost({ id: '123' });
        mockParseTumblrData.mockReturnValue(post1);
        await reader.goTo(1);

        const nav = reader.getNavigation();
        expect(nav.currentPage).toBe(1);
      });

      it('should not navigate for invalid page numbers', async () => {
        const initialCallCount = mockFetchTumblrData.mock.calls.length;

        await reader.goTo(0);
        await reader.goTo(100);

        // Should not have made additional calls
        expect(mockFetchTumblrData).toHaveBeenCalledTimes(initialCallCount);
      });
    });
  });

  describe('hasNavigation()', () => {
    it('should return correct navigation availability', async () => {
      const mockPost = createMockPost({
        nextPostUrl: 'https://www.tumblr.com/test-blog/456',
        prevPostUrl: undefined,
      });
      mockFetchTumblrData.mockResolvedValue({ type: 'api', data: {} });
      mockParseTumblrData.mockReturnValue(mockPost);

      await reader.loadFromUrl('https://www.tumblr.com/test-blog/123', container);

      const nav = reader.hasNavigation();
      expect(nav.canNext).toBe(true);
      expect(nav.canPrev).toBe(false);
    });

    it('should allow prev when history exists', async () => {
      const mockPost = createMockPost({
        nextPostUrl: 'https://www.tumblr.com/test-blog/456',
      });
      mockFetchTumblrData.mockResolvedValue({ type: 'api', data: {} });
      mockParseTumblrData.mockReturnValue(mockPost);

      await reader.loadFromUrl('https://www.tumblr.com/test-blog/123', container);

      // Navigate forward
      const nextPost = createMockPost({ id: '456' });
      mockParseTumblrData.mockReturnValue(nextPost);
      await reader.next();

      const nav = reader.hasNavigation();
      expect(nav.canPrev).toBe(true);
    });
  });

  describe('getNavigation()', () => {
    it('should return navigation object with methods', async () => {
      const mockPost = createMockPost();
      mockFetchTumblrData.mockResolvedValue({ type: 'api', data: {} });
      mockParseTumblrData.mockReturnValue(mockPost);

      await reader.loadFromUrl('https://www.tumblr.com/test-blog/123', container);

      const nav = reader.getNavigation();
      expect(nav.currentPage).toBe(1);
      expect(nav.totalPages).toBe(1);
      expect(typeof nav.next).toBe('function');
      expect(typeof nav.prev).toBe('function');
      expect(typeof nav.goTo).toBe('function');
    });
  });

  describe('getBlogName()', () => {
    it('should return blog name from current post', async () => {
      const mockPost = createMockPost({ blogName: 'my-cool-blog' });
      mockFetchTumblrData.mockResolvedValue({ type: 'api', data: {} });
      mockParseTumblrData.mockReturnValue(mockPost);

      await reader.loadFromUrl('https://www.tumblr.com/my-cool-blog/123', container);

      expect(reader.getBlogName()).toBe('my-cool-blog');
    });

    it('should return undefined when no post loaded', () => {
      expect(reader.getBlogName()).toBeUndefined();
    });
  });

  describe('setOnPageChange()', () => {
    it('should update callback', async () => {
      const mockPost = createMockPost();
      mockFetchTumblrData.mockResolvedValue({ type: 'api', data: {} });
      mockParseTumblrData.mockReturnValue(mockPost);

      await reader.loadFromUrl('https://www.tumblr.com/test-blog/123', container);

      const newCallback = vi.fn();
      reader.setOnPageChange(newCallback);

      // Navigate to trigger callback
      const nextPost = createMockPost({
        id: '456',
        nextPostUrl: 'https://www.tumblr.com/test-blog/789',
      });
      mockParseTumblrData.mockReturnValue(nextPost);

      // Need to set nextPostUrl on current post first
      const postWithNext = createMockPost({
        nextPostUrl: 'https://www.tumblr.com/test-blog/456',
      });
      mockParseTumblrData.mockReturnValue(postWithNext);
      await reader.loadFromUrl('https://www.tumblr.com/test-blog/123', container);

      reader.setOnPageChange(newCallback);
      mockParseTumblrData.mockReturnValue(nextPost);
      await reader.next();

      expect(newCallback).toHaveBeenCalled();
    });
  });

  describe('destroy()', () => {
    it('should clean up resources', async () => {
      const mockPost = createMockPost();
      mockFetchTumblrData.mockResolvedValue({ type: 'api', data: {} });
      mockParseTumblrData.mockReturnValue(mockPost);

      await reader.loadFromUrl('https://www.tumblr.com/test-blog/123', container);

      reader.destroy();

      expect(reader.getCurrentPost()).toBeNull();
      expect(reader.getBlogName()).toBeUndefined();
    });
  });

  describe('cache integration', () => {
    it('should use cached post when available', async () => {
      const mockPost = createMockPost();
      const mockCache = {
        get: vi.fn().mockReturnValue(mockPost),
        set: vi.fn(),
        getAllCached: vi.fn().mockReturnValue([]),
        clear: vi.fn(),
      };
      (TumblrCache as ReturnType<typeof vi.fn>).mockImplementation(() => mockCache);

      const cachedReader = new TumblrReader();
      await cachedReader.loadFromUrl('https://www.tumblr.com/test-blog/123', container);

      // Should not have called fetch since cache returned the post
      expect(mockFetchTumblrData).not.toHaveBeenCalled();
      expect(cachedReader.getCurrentPost()).toEqual(mockPost);

      cachedReader.destroy();
    });
  });
});
