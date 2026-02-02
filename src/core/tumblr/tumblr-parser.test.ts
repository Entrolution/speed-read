import { describe, it, expect } from 'vitest';
import { parseTumblrData, parseTumblrPage } from './tumblr-parser';
import type { FetchResult, TumblrApiResponse } from './tumblr-fetcher';

describe('parseTumblrData', () => {
  describe('with API response', () => {
    it('should parse API response correctly', () => {
      const apiResponse: TumblrApiResponse = {
        tumblelog: {
          name: 'test-blog',
          title: 'Test Blog',
          url: 'https://test-blog.tumblr.com',
        },
        posts: [{
          id: '123456789012',
          url: 'https://test-blog.tumblr.com/post/123456789012',
          'url-with-slug': 'https://test-blog.tumblr.com/post/123456789012/test',
          type: 'regular',
          date: '2024-01-01',
          'unix-timestamp': 1704067200,
          slug: 'test',
          tags: ['tag1', 'tag2'],
          'regular-title': 'Test Title',
          'regular-body': '<p>Test content</p>',
        }],
        'posts-start': 0,
        'posts-total': 1,
      };

      const result: FetchResult = { type: 'api', data: apiResponse };
      const post = parseTumblrData(result, 'https://test-blog.tumblr.com/post/123456789012');

      expect(post.id).toBe('123456789012');
      expect(post.title).toBe('Test Title');
      expect(post.blogName).toBe('test-blog');
      expect(post.tags).toContain('tag1');
      expect(post.tags).toContain('tag2');
      expect(post.timestamp).toBe(1704067200);
    });

    it('should parse photo posts', () => {
      const apiResponse: TumblrApiResponse = {
        tumblelog: { name: 'photo-blog', title: 'Photos', url: 'https://photo-blog.tumblr.com' },
        posts: [{
          id: '999',
          url: 'https://photo-blog.tumblr.com/post/999',
          'url-with-slug': 'https://photo-blog.tumblr.com/post/999/photo',
          type: 'photo',
          date: '2024-01-01',
          'unix-timestamp': 1704067200,
          slug: 'photo',
          'photo-url-1280': 'https://example.com/photo.jpg',
          'photo-caption': '<p>A nice photo</p>',
        }],
        'posts-start': 0,
        'posts-total': 1,
      };

      const result: FetchResult = { type: 'api', data: apiResponse };
      const post = parseTumblrData(result, 'https://photo-blog.tumblr.com/post/999');

      expect(post.headerImage).toBe('https://example.com/photo.jpg');
      expect(post.content.some(c => c.type === 'image')).toBe(true);
    });

    it('should throw when no posts in response', () => {
      const apiResponse: TumblrApiResponse = {
        tumblelog: { name: 'empty', title: 'Empty', url: 'https://empty.tumblr.com' },
        posts: [],
        'posts-start': 0,
        'posts-total': 0,
      };

      const result: FetchResult = { type: 'api', data: apiResponse };

      expect(() => parseTumblrData(result, 'https://empty.tumblr.com')).toThrow('No post found');
    });
  });

  describe('with HTML fallback', () => {
    // Note: HTML parsing tests require jsdom which is set up in vitest
    it('should return post with content from HTML', () => {
      const html = '<html><body><div class="post-content"><p>Hello world</p></div></body></html>';
      const result: FetchResult = { type: 'html', data: html };

      const post = parseTumblrData(result, 'https://www.tumblr.com/test-blog/123456789012/slug');

      expect(post.blogName).toBe('test-blog');
      expect(post.id).toBe('123456789012');
    });
  });
});

describe('parseTumblrPage (HTML fallback)', () => {
  const sourceUrl = 'https://www.tumblr.com/test-blog/123456789012/test-post';

  it('should extract blog name from URL', () => {
    const html = '<html><body></body></html>';
    const result = parseTumblrPage(html, sourceUrl);

    expect(result.blogName).toBe('test-blog');
    expect(result.blogUrl).toBe('https://test-blog.tumblr.com');
  });

  it('should extract post ID from URL', () => {
    const html = '<html><body></body></html>';
    const result = parseTumblrPage(html, sourceUrl);

    expect(result.id).toBe('123456789012');
  });

  it('should handle subdomain URLs', () => {
    const subdomainUrl = 'https://test-blog.tumblr.com/post/123456789012';
    const html = '<html><body></body></html>';

    const result = parseTumblrPage(html, subdomainUrl);

    expect(result.blogName).toBe('test-blog');
    expect(result.id).toBe('123456789012');
  });

  it('should return empty arrays for missing content', () => {
    const html = '<html><body></body></html>';
    const result = parseTumblrPage(html, sourceUrl);

    expect(result.content).toEqual(expect.any(Array));
    expect(result.reblogTrail).toEqual([]);
    expect(result.tags).toEqual([]);
  });

  it('should extract og:title meta tag', () => {
    const html = '<html><head><meta property="og:title" content="My Post Title" /></head><body></body></html>';
    const result = parseTumblrPage(html, sourceUrl);

    expect(result.title).toBe('My Post Title');
  });

  it('should extract og:image meta tag', () => {
    const html = '<html><head><meta property="og:image" content="https://example.com/image.jpg" /></head><body></body></html>';
    const result = parseTumblrPage(html, sourceUrl);

    expect(result.headerImage).toBe('https://example.com/image.jpg');
  });
});

describe('navigation extraction', () => {
  it('should extract Next link from content and set nextPostUrl', () => {
    const apiResponse: TumblrApiResponse = {
      tumblelog: { name: 'test-blog', title: 'Test', url: 'https://test-blog.tumblr.com' },
      posts: [{
        id: '123',
        url: 'https://test-blog.tumblr.com/post/123',
        'url-with-slug': 'https://test-blog.tumblr.com/post/123/part-1',
        type: 'regular',
        date: '2024-01-01',
        'unix-timestamp': 1704067200,
        slug: 'part-1',
        'regular-body': '<p>Story content</p><p><a href="https://test-blog.tumblr.com/post/456/part-2">Next</a></p>',
      }],
      'posts-start': 0,
      'posts-total': 1,
    };

    const result: FetchResult = { type: 'api', data: apiResponse };
    const post = parseTumblrData(result, 'https://test-blog.tumblr.com/post/123');

    expect(post.nextPostUrl).toBe('https://test-blog.tumblr.com/post/456/part-2');
  });

  it('should extract Previous link from content and set prevPostUrl', () => {
    const apiResponse: TumblrApiResponse = {
      tumblelog: { name: 'test-blog', title: 'Test', url: 'https://test-blog.tumblr.com' },
      posts: [{
        id: '456',
        url: 'https://test-blog.tumblr.com/post/456',
        'url-with-slug': 'https://test-blog.tumblr.com/post/456/part-2',
        type: 'regular',
        date: '2024-01-01',
        'unix-timestamp': 1704067200,
        slug: 'part-2',
        'regular-body': '<p><a href="https://test-blog.tumblr.com/post/123/part-1">Previous</a></p><p>Story content</p>',
      }],
      'posts-start': 0,
      'posts-total': 1,
    };

    const result: FetchResult = { type: 'api', data: apiResponse };
    const post = parseTumblrData(result, 'https://test-blog.tumblr.com/post/456');

    expect(post.prevPostUrl).toBe('https://test-blog.tumblr.com/post/123/part-1');
  });

  it('should extract both Next and Prev links', () => {
    const apiResponse: TumblrApiResponse = {
      tumblelog: { name: 'test-blog', title: 'Test', url: 'https://test-blog.tumblr.com' },
      posts: [{
        id: '456',
        url: 'https://test-blog.tumblr.com/post/456',
        'url-with-slug': 'https://test-blog.tumblr.com/post/456/part-2',
        type: 'regular',
        date: '2024-01-01',
        'unix-timestamp': 1704067200,
        slug: 'part-2',
        'regular-body': '<p>Story</p><p><a href="https://test-blog.tumblr.com/post/123">Prev</a> | <a href="https://test-blog.tumblr.com/post/789">Next</a></p>',
      }],
      'posts-start': 0,
      'posts-total': 1,
    };

    const result: FetchResult = { type: 'api', data: apiResponse };
    const post = parseTumblrData(result, 'https://test-blog.tumblr.com/post/456');

    expect(post.prevPostUrl).toBe('https://test-blog.tumblr.com/post/123');
    expect(post.nextPostUrl).toBe('https://test-blog.tumblr.com/post/789');
  });

  it('should remove nav-only content blocks', () => {
    const apiResponse: TumblrApiResponse = {
      tumblelog: { name: 'test-blog', title: 'Test', url: 'https://test-blog.tumblr.com' },
      posts: [{
        id: '456',
        url: 'https://test-blog.tumblr.com/post/456',
        'url-with-slug': 'https://test-blog.tumblr.com/post/456/part-2',
        type: 'regular',
        date: '2024-01-01',
        'unix-timestamp': 1704067200,
        slug: 'part-2',
        'regular-body': '<p>Main story content here.</p><p><a href="https://test-blog.tumblr.com/post/789">Next</a></p>',
      }],
      'posts-start': 0,
      'posts-total': 1,
    };

    const result: FetchResult = { type: 'api', data: apiResponse };
    const post = parseTumblrData(result, 'https://test-blog.tumblr.com/post/456');

    // The navigation-only paragraph should be removed
    expect(post.content.length).toBe(1);
    expect(post.content[0].text).toBe('Main story content here.');
  });

  it('should recognize Part X pattern as next link', () => {
    const apiResponse: TumblrApiResponse = {
      tumblelog: { name: 'test-blog', title: 'Test', url: 'https://test-blog.tumblr.com' },
      posts: [{
        id: '123',
        url: 'https://test-blog.tumblr.com/post/123',
        'url-with-slug': 'https://test-blog.tumblr.com/post/123/part-1',
        type: 'regular',
        date: '2024-01-01',
        'unix-timestamp': 1704067200,
        slug: 'part-1',
        'regular-body': '<p>Content</p><p><a href="https://test-blog.tumblr.com/post/456">Part 2</a></p>',
      }],
      'posts-start': 0,
      'posts-total': 1,
    };

    const result: FetchResult = { type: 'api', data: apiResponse };
    const post = parseTumblrData(result, 'https://test-blog.tumblr.com/post/123');

    expect(post.nextPostUrl).toBe('https://test-blog.tumblr.com/post/456');
  });

  it('should not extract non-tumblr links', () => {
    const apiResponse: TumblrApiResponse = {
      tumblelog: { name: 'test-blog', title: 'Test', url: 'https://test-blog.tumblr.com' },
      posts: [{
        id: '123',
        url: 'https://test-blog.tumblr.com/post/123',
        'url-with-slug': 'https://test-blog.tumblr.com/post/123/test',
        type: 'regular',
        date: '2024-01-01',
        'unix-timestamp': 1704067200,
        slug: 'test',
        'regular-body': '<p><a href="https://example.com/other-site">Next</a></p>',
      }],
      'posts-start': 0,
      'posts-total': 1,
    };

    const result: FetchResult = { type: 'api', data: apiResponse };
    const post = parseTumblrData(result, 'https://test-blog.tumblr.com/post/123');

    expect(post.nextPostUrl).toBeUndefined();
  });
});
