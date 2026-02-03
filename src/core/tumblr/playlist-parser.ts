/**
 * Playlist parser for Google Doc containing Tumblr URLs
 * Handles fetching the document and extracting URLs
 */

/**
 * Transform Google Doc edit URL to HTML export URL
 * We use HTML format to preserve hyperlinks (plain text loses them)
 * Input:  https://docs.google.com/document/d/ABC123/edit
 * Output: https://docs.google.com/document/d/ABC123/export?format=html
 */
export function getGoogleDocExportUrl(url: string): string {
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) {
    throw new Error('Invalid Google Doc URL. Expected format: docs.google.com/document/d/...');
  }
  return `https://docs.google.com/document/d/${match[1]}/export?format=html`;
}

/**
 * Extract Tumblr URLs from text or HTML content
 * Supports both www.tumblr.com/username/id/slug and username.tumblr.com/post/id/slug formats
 * Also extracts URLs from anchor tag href attributes in HTML
 * Deduplicates URLs in the output
 */
export function extractTumblrUrls(text: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();

  // Pattern for www.tumblr.com URLs: https://www.tumblr.com/username/123456/slug
  // Also matches without www
  const tumblrComPattern = /https?:\/\/(?:www\.)?tumblr\.com\/[^\s<>"'\]]+/gi;

  // Pattern for username.tumblr.com URLs: https://username.tumblr.com/post/123456/slug
  const subdomainPattern = /https?:\/\/[a-zA-Z0-9_-]+\.tumblr\.com\/post\/\d+[^\s<>"'\]]*/gi;

  // Check if this looks like HTML content
  const isHtml = /<a\s|href=/i.test(text);

  if (isHtml) {
    // Extract URLs from anchor tags
    // This handles Google Docs HTML export where URLs are in href attributes
    // Google Docs wraps external links: https://www.google.com/url?q=https://tumblr.com/...
    const hrefPattern = /href=["']([^"']*)["']/gi;
    let hrefMatch;
    while ((hrefMatch = hrefPattern.exec(text)) !== null) {
      let url = hrefMatch[1];
      // Decode HTML entities (Google Docs may encode ampersands)
      url = url.replace(/&amp;/g, '&');

      // Unwrap Google redirect URLs
      if (url.includes('google.com/url')) {
        const qMatch = url.match(/[?&]q=([^&]+)/);
        if (qMatch) {
          url = decodeURIComponent(qMatch[1]);
        }
      }

      // Only process Tumblr URLs
      if (!url.includes('tumblr.com')) {
        continue;
      }

      const cleaned = cleanUrl(url);
      if (cleaned && !seen.has(cleaned)) {
        seen.add(cleaned);
        urls.push(cleaned);
      }
    }
  }

  // For non-HTML content, check for plain text URLs
  // Skip this if we already found URLs from HTML to avoid duplicates from href values
  if (!isHtml || urls.length === 0) {
    for (const line of text.split('\n')) {
      const trimmed = line.trim();

      // Try tumblr.com pattern
      const tumblrComMatches = trimmed.match(tumblrComPattern);
      if (tumblrComMatches) {
        for (const match of tumblrComMatches) {
          // Clean up the URL - remove trailing punctuation
          const cleaned = cleanUrl(match);
          if (cleaned && !seen.has(cleaned)) {
            seen.add(cleaned);
            urls.push(cleaned);
          }
        }
      }

      // Try subdomain pattern
      const subdomainMatches = trimmed.match(subdomainPattern);
      if (subdomainMatches) {
        for (const match of subdomainMatches) {
          const cleaned = cleanUrl(match);
          if (cleaned && !seen.has(cleaned)) {
            seen.add(cleaned);
            urls.push(cleaned);
          }
        }
      }
    }
  }

  return urls;
}

/**
 * Clean a URL by removing trailing punctuation and query strings
 */
function cleanUrl(url: string): string {
  // Remove trailing punctuation that might have been captured
  let cleaned = url.replace(/[.,;:!?)}\]]+$/, '');

  // Also remove common tracking params but keep the path
  try {
    const urlObj = new URL(cleaned);
    // Keep the URL without query params for consistency
    cleaned = urlObj.origin + urlObj.pathname;
    // Remove trailing slash
    cleaned = cleaned.replace(/\/+$/, '');
  } catch {
    // If URL parsing fails, just return what we have
  }

  return cleaned;
}

/**
 * Extract a readable label from Tumblr URL slug
 * "my-post-title" -> "My Post Title"
 */
export function extractLabelFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);

    // For tumblr.com/username/id/slug format
    // pathParts would be: ['username', '123456', 'post-title']
    // For username.tumblr.com/post/id/slug format
    // pathParts would be: ['post', '123456', 'post-title']

    // Find the slug - it's typically after the numeric ID
    let slug: string | undefined;
    let postId: string | undefined;

    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i];
      if (/^\d+$/.test(part)) {
        postId = part;
        // Slug is the next part after the ID
        if (i + 1 < pathParts.length) {
          slug = pathParts[i + 1];
        }
        break;
      }
    }

    if (slug) {
      // Convert slug to title case: "my-post-title" -> "My Post Title"
      return slug
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    }

    if (postId) {
      return `Post ${postId}`;
    }

    return 'Untitled';
  } catch {
    return 'Untitled';
  }
}

/**
 * Extract blog name from Tumblr URL
 */
export function extractBlogNameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);

    // For subdomain format: username.tumblr.com
    if (urlObj.hostname.endsWith('.tumblr.com') && urlObj.hostname !== 'www.tumblr.com') {
      return urlObj.hostname.replace('.tumblr.com', '');
    }

    // For www.tumblr.com/username format
    if (urlObj.hostname === 'www.tumblr.com' || urlObj.hostname === 'tumblr.com') {
      const parts = urlObj.pathname.split('/').filter(Boolean);
      if (parts.length > 0) {
        return parts[0];
      }
    }

    return 'unknown';
  } catch {
    return 'unknown';
  }
}
