/**
 * Tumblr data fetcher using the legacy JSON API
 * Falls back to HTML scraping if API fails
 */

const DEFAULT_PROXIES = [
  'https://corsproxy.io/?',
  'https://api.allorigins.win/raw?url=',
  'https://cors.eu.org/',
];

export interface FetchOptions {
  /** User-provided proxy URL (takes priority over defaults) */
  customProxy?: string;
  /** Timeout in milliseconds (default: 10000) */
  timeout?: number;
  /** AbortSignal for canceling the request */
  signal?: AbortSignal;
}

export interface TumblrApiResponse {
  tumblelog: {
    name: string;
    title: string;
    url: string;
    avatar_url_512?: string;
  };
  posts: TumblrApiPost[];
  'posts-start': number;
  'posts-total': number;
}

export interface TumblrApiPost {
  id: string;
  'post-id'?: string;
  url: string;
  'url-with-slug': string;
  type: string;
  date: string;
  'unix-timestamp': number;
  slug: string;
  tags?: string[];
  // Regular post fields
  'regular-title'?: string;
  'regular-body'?: string;
  // Photo post fields
  'photo-url-1280'?: string;
  'photo-url-500'?: string;
  'photo-caption'?: string;
  // Reblog fields
  'reblogged-from-name'?: string;
  'reblogged-from-url'?: string;
  'reblogged-root-name'?: string;
  'reblog'?: {
    tree_html?: string;
    comment?: string;
  };
  // Allow access to other fields not explicitly typed
  [key: string]: unknown;
}

export interface FetchResult {
  type: 'api' | 'html';
  data: TumblrApiResponse | string;
}

/**
 * Parse a Tumblr URL to extract blog name and post ID
 */
export function parseTumblrUrl(url: string): { blogName: string; postId: string | null } {
  try {
    const urlObj = new URL(url);

    // Format 1: tumblr.com/blogname/postid/slug
    if (urlObj.hostname === 'www.tumblr.com' || urlObj.hostname === 'tumblr.com') {
      const parts = urlObj.pathname.split('/').filter(Boolean);
      const blogName = parts[0] || 'unknown';
      // Post ID is typically the numeric part
      const postId = parts.find(p => /^\d+$/.test(p)) || null;
      return { blogName, postId };
    }

    // Format 2: blogname.tumblr.com/post/postid/slug
    if (urlObj.hostname.endsWith('.tumblr.com')) {
      const blogName = urlObj.hostname.replace('.tumblr.com', '');
      const parts = urlObj.pathname.split('/').filter(Boolean);
      // Look for numeric post ID
      const postId = parts.find(p => /^\d+$/.test(p)) || null;
      return { blogName, postId };
    }

    return { blogName: 'unknown', postId: null };
  } catch {
    return { blogName: 'unknown', postId: null };
  }
}

/**
 * Build the legacy JSON API URL for a Tumblr post
 */
export function buildApiUrl(blogName: string, postId: string | null): string {
  const baseUrl = `https://${blogName}.tumblr.com/api/read/json`;
  if (postId) {
    return `${baseUrl}?id=${postId}`;
  }
  return baseUrl;
}

/**
 * Parse JSONP response from Tumblr's legacy API
 * Response format: var tumblr_api_read = {...};
 */
export function parseJsonp(jsonp: string): TumblrApiResponse {
  // Strip the JSONP wrapper
  const jsonMatch = jsonp.match(/var\s+tumblr_api_read\s*=\s*(\{[\s\S]*\});?\s*$/);
  if (!jsonMatch) {
    throw new Error('Invalid JSONP response format');
  }

  try {
    return JSON.parse(jsonMatch[1]);
  } catch (err) {
    throw new Error('Failed to parse Tumblr API JSON');
  }
}

/**
 * Fetch Tumblr post data using the legacy JSON API
 * Falls back to HTML if API fails
 */
export async function fetchTumblrData(
  url: string,
  options?: FetchOptions
): Promise<FetchResult> {
  const { blogName, postId } = parseTumblrUrl(url);

  // Try the legacy JSON API first
  try {
    const apiUrl = buildApiUrl(blogName, postId);
    const jsonp = await fetchViaCorsProxy(apiUrl, options);
    const data = parseJsonp(jsonp);

    // Verify we got the post we wanted
    if (postId && data.posts.length > 0) {
      const post = data.posts[0];
      if (post.id !== postId && post['post-id'] !== postId) {
        // API returned different post, fall back to HTML
        throw new Error('API returned wrong post');
      }
    }

    return { type: 'api', data };
  } catch (apiError) {
    // Fall back to HTML scraping
    console.warn('Tumblr API failed, falling back to HTML:', apiError);

    try {
      const html = await fetchViaCorsProxy(url, options);
      return { type: 'html', data: html };
    } catch (htmlError) {
      throw new Error(
        `Failed to fetch Tumblr post. API error: ${apiError instanceof Error ? apiError.message : 'Unknown'}. ` +
        `HTML error: ${htmlError instanceof Error ? htmlError.message : 'Unknown'}`
      );
    }
  }
}

/**
 * Fetch a URL via CORS proxy
 * Tries custom proxy first if provided, then falls back to default proxies
 */
export async function fetchViaCorsProxy(
  url: string,
  options?: FetchOptions
): Promise<string> {
  const timeout = options?.timeout ?? 10000;
  const externalSignal = options?.signal;

  // If custom proxy provided, try it first (and only)
  const proxies = options?.customProxy
    ? [options.customProxy]
    : DEFAULT_PROXIES;

  const errors: Error[] = [];

  for (const proxy of proxies) {
    // Check if already aborted before starting
    if (externalSignal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    // Create a combined abort controller for timeout + external signal
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Listen to external signal if provided
    const externalAbortHandler = () => controller.abort();
    externalSignal?.addEventListener('abort', externalAbortHandler);

    try {
      const proxyUrl = proxy + encodeURIComponent(url);

      const response = await fetch(proxyUrl, {
        signal: controller.signal,
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/json,text/javascript',
        },
      });

      clearTimeout(timeoutId);
      externalSignal?.removeEventListener('abort', externalAbortHandler);

      if (response.ok) {
        return await response.text();
      }

      errors.push(new Error(`HTTP ${response.status}: ${response.statusText}`));
    } catch (err) {
      clearTimeout(timeoutId);
      externalSignal?.removeEventListener('abort', externalAbortHandler);

      // Re-throw abort errors immediately without trying other proxies
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }
      errors.push(err instanceof Error ? err : new Error(String(err)));
      continue; // Try next proxy
    }
  }

  const message = options?.customProxy
    ? `Custom CORS proxy failed: ${errors[0]?.message ?? 'Unknown error'}`
    : `All CORS proxies failed. Last error: ${errors[errors.length - 1]?.message ?? 'Unknown error'}`;

  throw new Error(message);
}
