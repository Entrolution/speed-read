import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchViaCorsProxy,
  fetchTumblrData,
  parseTumblrUrl,
  buildApiUrl,
  parseJsonp,
} from './tumblr-fetcher';

describe('parseTumblrUrl', () => {
  it('should parse www.tumblr.com URLs', () => {
    const result = parseTumblrUrl('https://www.tumblr.com/revelboo/762688045814317056/everything-is-alright-pt1');
    expect(result.blogName).toBe('revelboo');
    expect(result.postId).toBe('762688045814317056');
  });

  it('should parse tumblr.com URLs without www', () => {
    const result = parseTumblrUrl('https://tumblr.com/test-blog/123456789012');
    expect(result.blogName).toBe('test-blog');
    expect(result.postId).toBe('123456789012');
  });

  it('should parse subdomain URLs', () => {
    const result = parseTumblrUrl('https://test-blog.tumblr.com/post/123456789012/slug');
    expect(result.blogName).toBe('test-blog');
    expect(result.postId).toBe('123456789012');
  });

  it('should handle URLs without post ID', () => {
    const result = parseTumblrUrl('https://www.tumblr.com/test-blog');
    expect(result.blogName).toBe('test-blog');
    expect(result.postId).toBeNull();
  });

  it('should handle invalid URLs', () => {
    const result = parseTumblrUrl('not-a-url');
    expect(result.blogName).toBe('unknown');
    expect(result.postId).toBeNull();
  });
});

describe('buildApiUrl', () => {
  it('should build API URL with post ID', () => {
    const url = buildApiUrl('test-blog', '123456789');
    expect(url).toBe('https://test-blog.tumblr.com/api/read/json?id=123456789');
  });

  it('should build API URL without post ID', () => {
    const url = buildApiUrl('test-blog', null);
    expect(url).toBe('https://test-blog.tumblr.com/api/read/json');
  });
});

describe('parseJsonp', () => {
  it('should parse valid JSONP response', () => {
    const jsonp = 'var tumblr_api_read = {"tumblelog":{"name":"test"},"posts":[]};';
    const result = parseJsonp(jsonp);
    expect(result.tumblelog.name).toBe('test');
    expect(result.posts).toEqual([]);
  });

  it('should handle JSONP without trailing semicolon', () => {
    const jsonp = 'var tumblr_api_read = {"tumblelog":{"name":"test"},"posts":[]}';
    const result = parseJsonp(jsonp);
    expect(result.tumblelog.name).toBe('test');
  });

  it('should throw on invalid JSONP format', () => {
    expect(() => parseJsonp('invalid data')).toThrow('Invalid JSONP response format');
  });

  it('should throw on invalid JSON', () => {
    const jsonp = 'var tumblr_api_read = {invalid json};';
    expect(() => parseJsonp(jsonp)).toThrow('Failed to parse Tumblr API JSON');
  });
});

describe('fetchViaCorsProxy', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should fetch via CORS proxy successfully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve('response data'),
    });

    const result = await fetchViaCorsProxy('https://example.com/test');

    expect(result).toBe('response data');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should use custom proxy when provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve('data'),
    });

    await fetchViaCorsProxy('https://example.com/test', {
      customProxy: 'https://my-proxy.com/?url=',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('https://my-proxy.com/?url='),
      expect.any(Object)
    );
  });

  it('should try multiple proxies on failure', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('Proxy 1 failed'))
      .mockRejectedValueOnce(new Error('Proxy 2 failed'))
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('success'),
      });

    const result = await fetchViaCorsProxy('https://example.com/test');

    expect(result).toBe('success');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('should throw when all proxies fail', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    await expect(fetchViaCorsProxy('https://example.com/test')).rejects.toThrow(
      'All CORS proxies failed'
    );
  });

  it('should encode URL in proxy request', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve('data'),
    });

    await fetchViaCorsProxy('https://example.com/test?param=value');

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain(encodeURIComponent('https://example.com/test?param=value'));
  });
});

describe('fetchTumblrData', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should fetch from API and return parsed data', async () => {
    const apiResponse = {
      tumblelog: { name: 'test-blog', title: 'Test Blog', url: 'https://test-blog.tumblr.com' },
      posts: [{ id: '123456789012', type: 'regular', 'regular-body': 'Test content' }],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(`var tumblr_api_read = ${JSON.stringify(apiResponse)};`),
    });

    const result = await fetchTumblrData('https://www.tumblr.com/test-blog/123456789012/slug');

    expect(result.type).toBe('api');
    expect(result.data).toEqual(apiResponse);
  });

  it('should fall back to HTML when API fails', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('API failed')) // First proxy for API
      .mockRejectedValueOnce(new Error('API failed')) // Second proxy for API
      .mockRejectedValueOnce(new Error('API failed')) // Third proxy for API
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('<html>HTML content</html>'),
      });

    const result = await fetchTumblrData('https://www.tumblr.com/test-blog/123456789012');

    expect(result.type).toBe('html');
    expect(result.data).toBe('<html>HTML content</html>');
  });

  it('should throw when both API and HTML fail', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    await expect(
      fetchTumblrData('https://www.tumblr.com/test-blog/123456789012')
    ).rejects.toThrow('Failed to fetch Tumblr post');
  });
});
