/**
 * Tumblr content rendering utilities
 * Shared by TumblrReader and TumblrPlaylistReader
 */

import type { TumblrContentBlock, ReblogEntry } from '@/types';
import { escapeHtml, sanitizeHtml } from '@/core/utils';

/**
 * Render a single Tumblr content block to HTML
 */
export function renderBlock(block: TumblrContentBlock): string {
  switch (block.type) {
    case 'heading1':
      return `<h1>${escapeHtml(block.text || '')}</h1>`;
    case 'heading2':
      return `<h2>${escapeHtml(block.text || '')}</h2>`;
    case 'image':
      return block.url
        ? `<img src="${escapeHtml(block.url)}" alt="" class="tumblr-image" loading="lazy" />`
        : '';
    case 'link':
      return block.url
        ? `<p><a href="${escapeHtml(block.url)}" target="_blank" rel="noopener">${escapeHtml(block.text || block.url)}</a></p>`
        : `<p>${escapeHtml(block.text || '')}</p>`;
    case 'video':
      return `<div class="tumblr-video">[Video: ${escapeHtml(block.url || 'embedded')}]</div>`;
    case 'audio':
      return `<div class="tumblr-audio">[Audio: ${escapeHtml(block.url || 'embedded')}]</div>`;
    case 'text':
    default:
      // Text may contain safe HTML from formatting
      return `<p>${sanitizeHtml(block.text || '')}</p>`;
  }
}

/**
 * Render a reblog trail entry to HTML
 */
export function renderReblogEntry(entry: ReblogEntry): string {
  const content = entry.content.map(b => renderBlock(b)).join('');
  return `
    <div class="tumblr-reblog-entry">
      <div class="tumblr-reblog-author">
        <a href="${escapeHtml(entry.blogUrl)}" target="_blank" rel="noopener">
          ${escapeHtml(entry.blogName)}
        </a>
      </div>
      <div class="tumblr-reblog-content">${content}</div>
    </div>
  `;
}
