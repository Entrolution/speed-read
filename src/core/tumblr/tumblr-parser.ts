/**
 * Parser for Tumblr post data
 * Handles both legacy JSON API responses and HTML fallback
 */

import type { TumblrPost, TumblrContentBlock, ReblogEntry } from '@/types';
import type { TumblrApiResponse, TumblrApiPost, FetchResult } from './tumblr-fetcher';

/**
 * Parse Tumblr data from either API response or HTML
 */
export function parseTumblrData(result: FetchResult, sourceUrl: string): TumblrPost {
  if (result.type === 'api') {
    return parseFromApi(result.data as TumblrApiResponse, sourceUrl);
  } else {
    return parseFromHtml(result.data as string, sourceUrl);
  }
}

/**
 * Parse post from legacy JSON API response
 */
function parseFromApi(response: TumblrApiResponse, _sourceUrl: string): TumblrPost {
  const post = response.posts[0];
  if (!post) {
    throw new Error('No post found in API response');
  }

  const blog = response.tumblelog;

  // Parse content based on post type
  let content = parseApiContent(post);

  // Parse reblog trail from tree_html if available
  const reblogTrail = parseReblogTrail(post);

  // Find header image
  const headerImage = findHeaderImage(post, content);

  // Extract navigation links from content (authors often embed Next/Prev links)
  const { nextPostUrl, prevPostUrl, filteredContent } = extractNavigationFromContent(content);
  content = filteredContent;

  return {
    id: post.id || post['post-id'] || String(Date.now()),
    title: post['regular-title'] || undefined,
    content,
    reblogTrail,
    headerImage,
    nextPostUrl,
    prevPostUrl,
    blogName: blog.name,
    blogUrl: blog.url || `https://${blog.name}.tumblr.com`,
    timestamp: post['unix-timestamp'] || Date.now() / 1000,
    tags: post.tags || [],
  };
}

/**
 * Extract navigation links (Next/Prev/Part X) from content blocks
 * Returns the URLs and filtered content with nav links removed
 */
function extractNavigationFromContent(content: TumblrContentBlock[]): {
  nextPostUrl?: string;
  prevPostUrl?: string;
  filteredContent: TumblrContentBlock[];
} {
  let nextPostUrl: string | undefined;
  let prevPostUrl: string | undefined;
  const filteredContent: TumblrContentBlock[] = [];

  // Patterns for navigation links
  const nextPatterns = [
    /\bnext\b/i,
    /\bpart\s*(\d+)\b/i,
    /\bpt\s*(\d+)\b/i,
    /\bchapter\s*(\d+)\b/i,
    /\bch\s*(\d+)\b/i,
    /→|>>|»/,
  ];

  const prevPatterns = [
    /\bprev(ious)?\b/i,
    /\bback\b/i,
    /\bstart\b/i,
    /\bbeginning\b/i,
    /←|<<|«/,
  ];

  for (const block of content) {
    // Check if this block contains navigation links
    const text = block.text || '';
    let isNavBlock = false;
    const extractedUrls: { url: string; isNext: boolean }[] = [];

    // Parse HTML to find links
    if (typeof DOMParser !== 'undefined' && text.includes('<a')) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'text/html');
      const links = doc.querySelectorAll('a[href]');

      links.forEach(link => {
        const href = link.getAttribute('href') || '';
        const linkText = link.textContent || '';

        // Get surrounding context - check text before and after the link
        // This handles cases like "N<a>ext</a>" where "Next" is split
        const parent = link.parentElement;
        const contextText = parent?.textContent || linkText;

        // Accept tumblr links: tumblr.com, t.umblr.com (redirect), or relative URLs
        const isTumblrLink =
          href.includes('tumblr.com') ||
          href.includes('t.umblr.com') ||
          href.startsWith('/');

        if (!isTumblrLink) return;

        // Check if this is a next/prev link
        // Priority: link text match > context match (handles "Prev | Next" in same element)
        const linkTextMatchesNext = nextPatterns.some(pattern => pattern.test(linkText));
        const linkTextMatchesPrev = prevPatterns.some(pattern => pattern.test(linkText));
        const contextMatchesNext = nextPatterns.some(pattern => pattern.test(contextText));
        const contextMatchesPrev = prevPatterns.some(pattern => pattern.test(contextText));

        // If link text explicitly matches one type, use that
        // Otherwise fall back to context match (for split text like "N<a>ext</a>")
        let isNextLink = linkTextMatchesNext;
        let isPrevLink = linkTextMatchesPrev;

        // Only use context match if link text doesn't match either pattern
        if (!linkTextMatchesNext && !linkTextMatchesPrev) {
          isNextLink = contextMatchesNext;
          isPrevLink = contextMatchesPrev;
        }

        if (isNextLink && !nextPostUrl) {
          extractedUrls.push({ url: href, isNext: true });
          isNavBlock = true;
        } else if (isPrevLink && !prevPostUrl) {
          extractedUrls.push({ url: href, isNext: false });
          isNavBlock = true;
        }
      });
    }

    // Also check for link-type blocks
    const blockUrlIsTumblr = block.url && (
      block.url.includes('tumblr.com') ||
      block.url.includes('t.umblr.com') ||
      block.url.startsWith('/')
    );
    if (block.type === 'link' && blockUrlIsTumblr) {
      const linkText = block.text || '';
      const isNextLink = nextPatterns.some(pattern => pattern.test(linkText));
      const isPrevLink = prevPatterns.some(pattern => pattern.test(linkText));

      if (isNextLink && !nextPostUrl && block.url) {
        extractedUrls.push({ url: block.url, isNext: true });
        isNavBlock = true;
      } else if (isPrevLink && !prevPostUrl && block.url) {
        extractedUrls.push({ url: block.url, isNext: false });
        isNavBlock = true;
      }
    }

    // Apply extracted URLs
    for (const { url, isNext } of extractedUrls) {
      if (isNext && !nextPostUrl) {
        nextPostUrl = url;
      } else if (!isNext && !prevPostUrl) {
        prevPostUrl = url;
      }
    }

    // If the entire block is just navigation (only contains nav links), skip it
    // Otherwise keep the block but the links are now also in navigation
    if (isNavBlock) {
      // Check if block is ONLY navigation (no other significant content)
      const strippedText = text
        .replace(/<a[^>]*>.*?<\/a>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/[|\-–—•·]/g, '')
        .trim();

      if (strippedText.length < 10) {
        // Block is mostly just nav links, skip it
        continue;
      }
    }

    filteredContent.push(block);
  }

  return { nextPostUrl, prevPostUrl, filteredContent };
}

/**
 * Parse content from API post based on post type
 */
function parseApiContent(post: TumblrApiPost): TumblrContentBlock[] {
  const content: TumblrContentBlock[] = [];

  switch (post.type) {
    case 'regular':
    case 'text':
      // Regular/text posts have regular-body with HTML content
      if (post['regular-body']) {
        content.push(...parseHtmlContent(post['regular-body']));
      }
      // Also check reblog comment
      if (post.reblog?.comment) {
        content.push(...parseHtmlContent(post.reblog.comment));
      }
      break;

    case 'photo': {
      // Photo posts
      const photoUrl = post['photo-url-1280'] || post['photo-url-500'];
      if (photoUrl) {
        content.push({ type: 'image', url: photoUrl });
      }
      if (post['photo-caption']) {
        content.push(...parseHtmlContent(post['photo-caption']));
      }
      break;
    }

    case 'quote': {
      // Quote posts - format as blockquote
      const quoteText = post['quote-text'];
      const quoteSource = post['quote-source'];
      if (quoteText) {
        content.push({ type: 'text', text: `<blockquote>"${quoteText}"</blockquote>` });
      }
      if (quoteSource) {
        content.push({ type: 'text', text: `<em>— ${quoteSource}</em>` });
      }
      break;
    }

    case 'link': {
      // Link posts
      const linkUrl = post['link-url'];
      const linkText = post['link-text'];
      const linkDesc = post['link-description'];
      if (linkUrl) {
        content.push({
          type: 'link',
          url: String(linkUrl),
          text: String(linkText || linkUrl),
        });
      }
      if (linkDesc) {
        content.push(...parseHtmlContent(String(linkDesc)));
      }
      break;
    }

    case 'answer': {
      // Ask/answer posts - just show the answer content
      const answer = post['answer'] as string | undefined;
      if (answer) {
        content.push(...parseHtmlContent(answer));
      }
      break;
    }

    case 'chat': {
      // Chat/dialogue posts - format with speaker labels
      const dialogue = post['conversation'];
      const chatTitle = post['conversation-title'] as string | undefined;
      if (chatTitle) {
        content.push({ type: 'heading2', text: chatTitle });
      }
      if (Array.isArray(dialogue)) {
        dialogue.forEach((line: { label?: string; phrase?: string; name?: string }) => {
          const speaker = line.label || line.name || '';
          const phrase = line.phrase || '';
          if (speaker && phrase) {
            content.push({ type: 'text', text: `<strong>${speaker}</strong> ${phrase}` });
          } else if (phrase) {
            content.push({ type: 'text', text: phrase });
          }
        });
      }
      break;
    }

    case 'video': {
      // Video posts - try to extract source info
      const videoCaption = post['video-caption'];
      const videoSource = post['video-source'] as string | undefined;
      const videoTitle = post['video-title'] as string | undefined;
      let videoText = '[Video';
      if (videoTitle) {
        videoText += `: ${videoTitle}`;
      } else if (videoSource) {
        videoText += ` from ${videoSource}`;
      }
      videoText += ']';
      content.push({ type: 'video', text: videoText });
      if (videoCaption) {
        content.push(...parseHtmlContent(String(videoCaption)));
      }
      break;
    }

    case 'audio': {
      // Audio posts - extract track info
      const audioCaption = post['audio-caption'];
      const audioArtist = post['id3-artist'] as string | undefined;
      const audioTrack = post['id3-title'] as string | undefined;
      const audioAlbum = post['id3-album'] as string | undefined;
      let audioText = '[Audio';
      if (audioTrack && audioArtist) {
        audioText += `: "${audioTrack}" by ${audioArtist}`;
        if (audioAlbum) {
          audioText += ` (${audioAlbum})`;
        }
      } else if (audioTrack) {
        audioText += `: ${audioTrack}`;
      }
      audioText += ']';
      content.push({ type: 'audio', text: audioText });
      if (audioCaption) {
        content.push(...parseHtmlContent(String(audioCaption)));
      }
      break;
    }

    default: {
      // Unknown type - try to extract any body content
      const body = post['body'] || post['regular-body'];
      if (body) {
        content.push(...parseHtmlContent(String(body)));
      }
    }
  }

  return content;
}

/**
 * Parse HTML content into content blocks
 */
function parseHtmlContent(html: string): TumblrContentBlock[] {
  const content: TumblrContentBlock[] = [];

  // Simple HTML parsing - extract paragraphs, headings, and images
  // This runs in the browser, so we can use DOMParser
  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const processNode = (node: Node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        const tagName = el.tagName.toLowerCase();

        if (tagName === 'p') {
          const text = el.innerHTML;
          if (text.trim()) {
            content.push({ type: 'text', text });
          }
        } else if (tagName === 'h1') {
          content.push({ type: 'heading1', text: el.textContent || '' });
        } else if (tagName === 'h2' || tagName === 'h3') {
          content.push({ type: 'heading2', text: el.textContent || '' });
        } else if (tagName === 'img') {
          const src = el.getAttribute('src');
          if (src) {
            content.push({ type: 'image', url: src });
          }
        } else if (tagName === 'figure') {
          // Process figure contents (usually contains img)
          el.childNodes.forEach(processNode);
        } else if (tagName === 'blockquote') {
          // Process blockquote contents
          el.childNodes.forEach(processNode);
        } else if (tagName === 'div' || tagName === 'span') {
          // Process div/span contents
          el.childNodes.forEach(processNode);
        } else if (tagName === 'br') {
          // Skip br tags
        } else {
          // For other elements, try to get text content
          const text = el.innerHTML;
          if (text.trim() && !el.querySelector('p, h1, h2, h3, img')) {
            content.push({ type: 'text', text });
          } else {
            el.childNodes.forEach(processNode);
          }
        }
      } else if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.trim();
        if (text) {
          content.push({ type: 'text', text });
        }
      }
    };

    doc.body.childNodes.forEach(processNode);
  } else {
    // Fallback for non-browser environments
    // Strip HTML tags and create single text block
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text) {
      content.push({ type: 'text', text });
    }
  }

  return content;
}

/**
 * Parse reblog trail from API post
 */
function parseReblogTrail(post: TumblrApiPost): ReblogEntry[] {
  const trail: ReblogEntry[] = [];

  // Check for reblog tree_html
  if (post.reblog?.tree_html) {
    // Parse the reblog tree HTML
    if (typeof DOMParser !== 'undefined') {
      const parser = new DOMParser();
      const doc = parser.parseFromString(post.reblog.tree_html, 'text/html');

      // Tumblr reblog tree uses specific class names
      const reblogEntries = doc.querySelectorAll('.tumblr_parent, .reblog-content');
      reblogEntries.forEach(entry => {
        // Try to find author info
        const authorLink = entry.querySelector('a.tumblr_blog, .reblog-header a');
        const blogName = authorLink?.textContent || 'unknown';
        const blogUrl = authorLink?.getAttribute('href') || `https://${blogName}.tumblr.com`;

        // Get content
        const contentEl = entry.querySelector('.reblog-content') || entry;
        const content = parseHtmlContent(contentEl.innerHTML);

        if (content.length > 0) {
          trail.push({ blogName, blogUrl, content });
        }
      });
    }
  }

  // Also check reblogged-from info
  if (post['reblogged-from-name'] && trail.length === 0) {
    // No tree_html but we know it's a reblog
    trail.push({
      blogName: post['reblogged-from-name'],
      blogUrl: post['reblogged-from-url'] || `https://${post['reblogged-from-name']}.tumblr.com`,
      content: [], // Content would be in the main body
    });
  }

  return trail;
}

/**
 * Find header image from post
 */
function findHeaderImage(post: TumblrApiPost, content: TumblrContentBlock[]): string | undefined {
  // Check photo post URLs first
  if (post['photo-url-1280']) return post['photo-url-1280'];
  if (post['photo-url-500']) return post['photo-url-500'];

  // Check content for first image
  for (const block of content) {
    if (block.type === 'image' && block.url) {
      return block.url;
    }
  }

  return undefined;
}

/**
 * Fallback: Parse from HTML when API is not available
 */
function parseFromHtml(html: string, sourceUrl: string): TumblrPost {
  const blogName = extractBlogNameFromUrl(sourceUrl);

  if (typeof DOMParser === 'undefined') {
    // Non-browser fallback
    return {
      id: extractPostIdFromUrl(sourceUrl) || String(Date.now()),
      content: [{ type: 'text', text: 'Unable to parse HTML content' }],
      reblogTrail: [],
      blogName,
      blogUrl: `https://${blogName}.tumblr.com`,
      timestamp: Date.now() / 1000,
      tags: [],
    };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Try to find post content in common selectors
  const selectors = [
    '.post-content',
    '.post-body',
    'article.post',
    '.tumblr-post',
    '[data-post-content]',
    '.post',
  ];

  let contentElement: Element | null = null;
  for (const selector of selectors) {
    contentElement = doc.querySelector(selector);
    if (contentElement) break;
  }

  let parsedContent: TumblrContentBlock[] = [];
  if (contentElement) {
    parsedContent = parseHtmlContent(contentElement.innerHTML);
  }

  // Extract navigation links from content and filter them out
  const { nextPostUrl, prevPostUrl, filteredContent } = extractNavigationFromContent(parsedContent);

  // Extract title
  const title = doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
                doc.querySelector('h1.post-title')?.textContent?.trim() ||
                doc.querySelector('h1')?.textContent?.trim();

  // Extract header image
  const headerImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || undefined;

  return {
    id: extractPostIdFromUrl(sourceUrl) || String(Date.now()),
    title,
    content: filteredContent,
    reblogTrail: [],
    headerImage,
    nextPostUrl,
    prevPostUrl,
    blogName,
    blogUrl: `https://${blogName}.tumblr.com`,
    timestamp: Date.now() / 1000,
    tags: [],
  };
}

/**
 * Extract blog name from URL
 */
function extractBlogNameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname === 'www.tumblr.com' || urlObj.hostname === 'tumblr.com') {
      const parts = urlObj.pathname.split('/').filter(Boolean);
      return parts[0] || 'unknown';
    }
    return urlObj.hostname.split('.')[0];
  } catch {
    return 'unknown';
  }
}

/**
 * Extract post ID from URL
 */
function extractPostIdFromUrl(url: string): string | null {
  const match = url.match(/\/(\d{10,})/);
  return match ? match[1] : null;
}

// Keep the old function for backwards compatibility
export function parseTumblrPage(html: string, sourceUrl: string): TumblrPost {
  return parseFromHtml(html, sourceUrl);
}

export function parseNavigationFromHtml(html: string): { nextPostUrl?: string; prevPostUrl?: string } {
  if (typeof DOMParser === 'undefined') {
    return {};
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  let nextPostUrl: string | undefined;
  let prevPostUrl: string | undefined;

  const links = doc.querySelectorAll('a');
  links.forEach(link => {
    const text = link.textContent?.toLowerCase() || '';
    const href = link.getAttribute('href');
    if (!href) return;

    if (text.includes('next') && href.includes('tumblr.com')) {
      if (!nextPostUrl) nextPostUrl = href;
    }
    if ((text.includes('prev') || text.includes('previous')) && href.includes('tumblr.com')) {
      if (!prevPostUrl) prevPostUrl = href;
    }
  });

  return { nextPostUrl, prevPostUrl };
}
