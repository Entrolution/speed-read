/**
 * UI utilities for common loading/error states
 * Used by Tumblr readers for consistent rendering
 */

import { escapeHtml } from './html-utils';

/**
 * Generate loading spinner HTML
 */
export function createLoadingHtml(message = 'Loading...'): string {
  return `
    <div class="tumblr-loading">
      <div class="tumblr-spinner"></div>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

/**
 * Generate error message HTML with retry button
 */
export function createErrorHtml(message: string, title = 'Could not load post'): string {
  return `
    <div class="tumblr-error">
      <div class="tumblr-error-icon">!</div>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(message)}</p>
      <button class="tumblr-retry-btn" onclick="this.closest('.tumblr-error').dispatchEvent(new CustomEvent('retry', { bubbles: true }))">
        Try Again
      </button>
    </div>
  `;
}

/**
 * Generate loading skeleton HTML for playlist reader
 */
export function createSkeletonHtml(pageNum: number, totalPages: number): string {
  return `
    <article class="tumblr-post tumblr-skeleton">
      <div class="tumblr-loading-info">Loading post ${pageNum} of ${totalPages}...</div>
      <div class="skeleton-header"></div>
      <div class="skeleton-author"></div>
      <div class="skeleton-line skeleton-line--full"></div>
      <div class="skeleton-line skeleton-line--full"></div>
      <div class="skeleton-line skeleton-line--80"></div>
      <div class="skeleton-line skeleton-line--full"></div>
      <div class="skeleton-line skeleton-line--60"></div>
    </article>
  `;
}

/**
 * Set up retry event listener on a container
 * @param container The container element
 * @param onRetry Callback to invoke on retry
 * @returns Cleanup function to remove the listener
 */
export function setupRetryListener(container: HTMLElement, onRetry: () => void): () => void {
  const handler = () => onRetry();
  const errorElement = container.querySelector('.tumblr-error');
  errorElement?.addEventListener('retry', handler);

  return () => {
    errorElement?.removeEventListener('retry', handler);
  };
}
