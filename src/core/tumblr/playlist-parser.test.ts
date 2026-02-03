import { describe, it, expect } from 'vitest';
import {
  getGoogleDocExportUrl,
  extractTumblrUrls,
  extractLabelFromUrl,
  extractBlogNameFromUrl,
} from './playlist-parser';

describe('getGoogleDocExportUrl', () => {
  it('should transform edit URL to export URL', () => {
    const input = 'https://docs.google.com/document/d/ABC123/edit';
    const expected = 'https://docs.google.com/document/d/ABC123/export?format=html';
    expect(getGoogleDocExportUrl(input)).toBe(expected);
  });

  it('should handle URL with view suffix', () => {
    const input = 'https://docs.google.com/document/d/XYZ789-abc_def/view';
    const expected = 'https://docs.google.com/document/d/XYZ789-abc_def/export?format=html';
    expect(getGoogleDocExportUrl(input)).toBe(expected);
  });

  it('should handle URL with just document ID', () => {
    const input = 'https://docs.google.com/document/d/1a2B3c4D5e6F7g8H9i0J';
    const expected = 'https://docs.google.com/document/d/1a2B3c4D5e6F7g8H9i0J/export?format=html';
    expect(getGoogleDocExportUrl(input)).toBe(expected);
  });

  it('should throw for invalid Google Doc URL', () => {
    expect(() => getGoogleDocExportUrl('https://example.com/doc')).toThrow(
      'Invalid Google Doc URL'
    );
  });

  it('should handle Google Drive file URLs (extracts doc ID)', () => {
    // Note: drive.google.com/file/d/ID also matches the pattern, which is acceptable
    // The function transforms any URL with /d/ID/ pattern
    const input = 'https://drive.google.com/file/d/ABC123';
    const expected = 'https://docs.google.com/document/d/ABC123/export?format=html';
    expect(getGoogleDocExportUrl(input)).toBe(expected);
  });
});

describe('extractTumblrUrls', () => {
  it('should extract www.tumblr.com URLs', () => {
    const text = `
Check out this post: https://www.tumblr.com/username/12345678901/my-post-title
And another one: https://tumblr.com/otherblog/98765432109/another-post
    `;
    const urls = extractTumblrUrls(text);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toBe('https://www.tumblr.com/username/12345678901/my-post-title');
    expect(urls[1]).toBe('https://tumblr.com/otherblog/98765432109/another-post');
  });

  it('should extract subdomain tumblr URLs', () => {
    const text = `
Post 1: https://coolblog.tumblr.com/post/12345678901/great-title
Post 2: https://another-blog.tumblr.com/post/98765432109/another-title
    `;
    const urls = extractTumblrUrls(text);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toBe('https://coolblog.tumblr.com/post/12345678901/great-title');
    expect(urls[1]).toBe('https://another-blog.tumblr.com/post/98765432109/another-title');
  });

  it('should handle mixed URL formats', () => {
    const text = `
https://www.tumblr.com/user1/111/post-one
https://blog2.tumblr.com/post/222/post-two
https://tumblr.com/user3/333/post-three
    `;
    const urls = extractTumblrUrls(text);
    expect(urls).toHaveLength(3);
  });

  it('should deduplicate URLs', () => {
    const text = `
https://www.tumblr.com/user/123/same-post
https://www.tumblr.com/user/123/same-post
https://www.tumblr.com/user/123/same-post
    `;
    const urls = extractTumblrUrls(text);
    expect(urls).toHaveLength(1);
  });

  it('should handle URLs with trailing punctuation', () => {
    const text = `
Check this: https://www.tumblr.com/user/123/post-title.
And this (https://blog.tumblr.com/post/456/another)!
    `;
    const urls = extractTumblrUrls(text);
    expect(urls).toHaveLength(2);
    // URLs are cleaned up - no trailing period or closing paren
    expect(urls[0]).toBe('https://www.tumblr.com/user/123/post-title');
    expect(urls[1]).toBe('https://blog.tumblr.com/post/456/another');
  });

  it('should return empty array when no URLs found', () => {
    const text = 'No Tumblr URLs here, just regular text.';
    const urls = extractTumblrUrls(text);
    expect(urls).toHaveLength(0);
  });

  it('should handle empty text', () => {
    expect(extractTumblrUrls('')).toHaveLength(0);
  });

  it('should extract URLs from HTML anchor tags', () => {
    const html = `
      <html><body>
        <a href="https://www.tumblr.com/user1/123/post-one">Post One</a>
        <a href="https://blog2.tumblr.com/post/456/post-two">Post Two</a>
      </body></html>
    `;
    const urls = extractTumblrUrls(html);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toBe('https://www.tumblr.com/user1/123/post-one');
    expect(urls[1]).toBe('https://blog2.tumblr.com/post/456/post-two');
  });

  it('should handle HTML-encoded ampersands in URLs', () => {
    const html = `<a href="https://www.tumblr.com/user/123/title?foo=bar&amp;baz=qux">Link</a>`;
    const urls = extractTumblrUrls(html);
    expect(urls).toHaveLength(1);
    // Query params are stripped during URL normalization, but the base URL is preserved
    expect(urls[0]).toBe('https://www.tumblr.com/user/123/title');
  });

  it('should extract URLs from Google Docs HTML export format', () => {
    // Google Docs wraps external URLs in their redirect service
    const html = `
      <html><head></head><body>
        <p><a href="https://www.google.com/url?q=https://www.tumblr.com/revelboo/789974381225984000/post-title&amp;sa=D&amp;source=editors">Fort Max x Reader</a></p>
        <p><a href="https://www.google.com/url?q=https://www.tumblr.com/revelboo/791956158068981761/another-post&amp;sa=D&amp;source=editors">Optimus x Reader</a></p>
      </body></html>
    `;
    const urls = extractTumblrUrls(html);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain('789974381225984000');
    expect(urls[1]).toContain('791956158068981761');
    // Should NOT contain google.com redirect
    expect(urls[0]).not.toContain('google.com');
  });

  it('should extract both linked and bare plain-text URLs from HTML', () => {
    const html = `
      <html><body>
        <p><a href="https://www.tumblr.com/user1/111/linked-post">Linked</a></p>
        <p>https://www.tumblr.com/user2/222/bare-post</p>
      </body></html>
    `;
    const urls = extractTumblrUrls(html);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toBe('https://www.tumblr.com/user1/111/linked-post');
    expect(urls[1]).toBe('https://www.tumblr.com/user2/222/bare-post');
  });

  it('should extract plain-text URLs from HTML even when no hrefs link to tumblr', () => {
    const html = `
      <html><body>
        <a href="https://example.com">Not tumblr</a>
        <p>https://www.tumblr.com/blogger/333/plain-text-only</p>
      </body></html>
    `;
    const urls = extractTumblrUrls(html);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toBe('https://www.tumblr.com/blogger/333/plain-text-only');
  });

  it('should extract URLs split across span tags', () => {
    const html = `
      <html><body>
        <p><span>https://www.</span><span>tumblr.com/user/444/split-span-post</span></p>
      </body></html>
    `;
    const urls = extractTumblrUrls(html);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toBe('https://www.tumblr.com/user/444/split-span-post');
  });

  it('should preserve document order when linked and bare URLs are interleaved', () => {
    const html = `
      <html><body>
        <p><a href="https://www.tumblr.com/user1/111/first">First</a></p>
        <p>https://www.tumblr.com/user2/222/second</p>
        <p><a href="https://www.tumblr.com/user3/333/third">Third</a></p>
        <p>https://www.tumblr.com/user4/444/fourth</p>
      </body></html>
    `;
    const urls = extractTumblrUrls(html);
    expect(urls).toEqual([
      'https://www.tumblr.com/user1/111/first',
      'https://www.tumblr.com/user2/222/second',
      'https://www.tumblr.com/user3/333/third',
      'https://www.tumblr.com/user4/444/fourth',
    ]);
  });
});

describe('extractLabelFromUrl', () => {
  it('should extract label from www.tumblr.com URL slug', () => {
    const url = 'https://www.tumblr.com/username/12345678901/my-awesome-post-title';
    expect(extractLabelFromUrl(url)).toBe('My Awesome Post Title');
  });

  it('should extract label from subdomain URL slug', () => {
    const url = 'https://coolblog.tumblr.com/post/98765432109/another-great-post';
    expect(extractLabelFromUrl(url)).toBe('Another Great Post');
  });

  it('should return Post ID when no slug available', () => {
    const url = 'https://www.tumblr.com/username/12345678901';
    expect(extractLabelFromUrl(url)).toBe('Post 12345678901');
  });

  it('should return Untitled for malformed URLs', () => {
    const url = 'https://example.com/not-a-tumblr-url';
    expect(extractLabelFromUrl(url)).toBe('Untitled');
  });

  it('should handle single word slugs', () => {
    const url = 'https://www.tumblr.com/user/123/hello';
    expect(extractLabelFromUrl(url)).toBe('Hello');
  });
});

describe('extractBlogNameFromUrl', () => {
  it('should extract blog name from subdomain URL', () => {
    const url = 'https://coolblog.tumblr.com/post/123/title';
    expect(extractBlogNameFromUrl(url)).toBe('coolblog');
  });

  it('should extract blog name from www.tumblr.com URL', () => {
    const url = 'https://www.tumblr.com/username/123/title';
    expect(extractBlogNameFromUrl(url)).toBe('username');
  });

  it('should extract blog name from tumblr.com URL without www', () => {
    const url = 'https://tumblr.com/blogname/456/post';
    expect(extractBlogNameFromUrl(url)).toBe('blogname');
  });

  it('should return unknown for invalid URLs', () => {
    expect(extractBlogNameFromUrl('not-a-url')).toBe('unknown');
    expect(extractBlogNameFromUrl('https://example.com')).toBe('unknown');
  });

  it('should handle blog names with hyphens and underscores', () => {
    const url = 'https://cool-blog_name.tumblr.com/post/123/title';
    expect(extractBlogNameFromUrl(url)).toBe('cool-blog_name');
  });
});
