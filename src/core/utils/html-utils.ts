/**
 * HTML escaping and sanitization utilities
 * Used by Tumblr readers for safe content rendering
 */

/** Map for single-pass HTML escaping (more efficient than chained replaces) */
const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escape HTML special characters to prevent XSS
 */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, char => HTML_ESCAPE_MAP[char]);
}

/** Tags allowed in sanitized HTML output */
const ALLOWED_TAGS = ['strong', 'em', 'b', 'i', 's', 'u', 'br'];

/**
 * Sanitize HTML, keeping only safe formatting tags
 * Allows: strong, em, b, i, s, u, br, and safe anchor links
 */
export function sanitizeHtml(html: string): string {
  // Create a temporary div to parse HTML
  const temp = document.createElement('div');
  temp.innerHTML = html;

  const clean = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return escapeHtml(node.textContent || '');
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }

    const element = node as Element;
    const tagName = element.tagName.toLowerCase();

    // Handle allowed tags
    if (ALLOWED_TAGS.includes(tagName)) {
      const children = Array.from(element.childNodes).map(clean).join('');
      if (tagName === 'br') {
        return '<br/>';
      }
      return `<${tagName}>${children}</${tagName}>`;
    }

    // Handle links specially - only allow http/https URLs
    if (tagName === 'a') {
      const href = element.getAttribute('href');
      const children = Array.from(element.childNodes).map(clean).join('');
      if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
        return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${children}</a>`;
      }
      return children;
    }

    // For other tags, just include their text content
    return Array.from(element.childNodes).map(clean).join('');
  };

  return Array.from(temp.childNodes).map(clean).join('');
}
