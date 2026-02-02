/**
 * EPUB export generation for cached Tumblr posts
 * Creates valid EPUB 3 files from post content
 */

import type { TumblrPost, TumblrContentBlock, ReblogEntry } from '@/types';

interface ImageInfo {
  url: string;
  filename: string;
  mediaType: string;
  data?: ArrayBuffer;
}

export interface ExportProgress {
  stage: 'collecting' | 'downloading' | 'packaging';
  current: number;
  total: number;
  message: string;
}

export type ProgressCallback = (progress: ExportProgress) => void;

/**
 * Generate an EPUB file from cached Tumblr posts
 * @param posts Array of posts to include (should be in reading order)
 * @param title Title for the EPUB
 * @param onProgress Optional callback for progress updates
 * @returns Blob containing the EPUB file
 */
export async function generateEpub(
  posts: TumblrPost[],
  title: string,
  onProgress?: ProgressCallback
): Promise<Blob> {
  // Dynamically import jszip only when needed
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  // Collect all images from posts
  onProgress?.({ stage: 'collecting', current: 0, total: posts.length, message: 'Collecting images...' });

  const imageMap = new Map<string, ImageInfo>();
  let imageCounter = 0;

  for (const post of posts) {
    collectImages(post.content, imageMap, () => `img${imageCounter++}`);
    for (const entry of post.reblogTrail) {
      collectImages(entry.content, imageMap, () => `img${imageCounter++}`);
    }
  }

  // Download all images
  const totalImages = imageMap.size;
  if (totalImages > 0) {
    onProgress?.({ stage: 'downloading', current: 0, total: totalImages, message: `Downloading 0/${totalImages} images...` });
    await downloadImages(imageMap, (current) => {
      onProgress?.({ stage: 'downloading', current, total: totalImages, message: `Downloading ${current}/${totalImages} images...` });
    });
  }

  // EPUB requires mimetype to be first and uncompressed
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  // META-INF/container.xml
  zip.file('META-INF/container.xml', generateContainerXml());

  // Generate unique ID for the book
  const bookId = `tumblr-export-${Date.now()}`;

  // content.opf (package document)
  zip.file('OEBPS/content.opf', generateOpf(posts, title, bookId, imageMap));

  // toc.ncx (NCX navigation for EPUB 2 compatibility)
  zip.file('OEBPS/toc.ncx', generateTocNcx(posts, title, bookId));

  // nav.xhtml (EPUB 3 navigation)
  zip.file('OEBPS/nav.xhtml', generateNavXhtml(posts, title));

  // stylesheet.css
  zip.file('OEBPS/stylesheet.css', generateStylesheet());

  // Add images to the zip
  for (const [, info] of imageMap) {
    if (info.data) {
      zip.file(`OEBPS/images/${info.filename}`, info.data);
    }
  }

  // Generate chapter files
  onProgress?.({ stage: 'packaging', current: 0, total: posts.length, message: 'Creating EPUB...' });

  posts.forEach((post, index) => {
    const content = renderPostToXhtml(post, index, imageMap);
    zip.file(`OEBPS/chapter${index}.xhtml`, content);
  });

  onProgress?.({ stage: 'packaging', current: posts.length, total: posts.length, message: 'Finalizing...' });

  return await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/epub+zip',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
}

/**
 * Collect all image URLs from content blocks
 */
function collectImages(
  content: TumblrContentBlock[],
  imageMap: Map<string, ImageInfo>,
  getNextId: () => string
): void {
  for (const block of content) {
    if (block.type === 'image' && block.url && !imageMap.has(block.url)) {
      const ext = getImageExtension(block.url);
      const filename = `${getNextId()}.${ext}`;
      const mediaType = getMediaType(ext);
      imageMap.set(block.url, { url: block.url, filename, mediaType });
    }
  }
}

/**
 * Get image file extension from URL
 */
function getImageExtension(url: string): string {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    if (pathname.includes('.png')) return 'png';
    if (pathname.includes('.gif')) return 'gif';
    if (pathname.includes('.webp')) return 'webp';
    if (pathname.includes('.svg')) return 'svg';
    // Default to jpg for Tumblr images
    return 'jpg';
  } catch {
    return 'jpg';
  }
}

/**
 * Get MIME type for image extension
 */
function getMediaType(ext: string): string {
  const types: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
  };
  return types[ext] || 'image/jpeg';
}

/**
 * Download all images with progress tracking
 */
async function downloadImages(
  imageMap: Map<string, ImageInfo>,
  onProgress?: (completed: number) => void
): Promise<void> {
  let completed = 0;

  const downloads = Array.from(imageMap.entries()).map(async ([url, info]) => {
    try {
      const response = await fetch(url);
      if (response.ok) {
        info.data = await response.arrayBuffer();
      }
    } catch {
      // Skip failed downloads - image won't be included
      console.warn('Failed to download image:', url);
    } finally {
      completed++;
      onProgress?.(completed);
    }
  });

  await Promise.all(downloads);
}

/**
 * Generate container.xml
 */
function generateContainerXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
}

/**
 * Generate content.opf (package document)
 */
function generateOpf(
  posts: TumblrPost[],
  title: string,
  bookId: string,
  imageMap: Map<string, ImageInfo>
): string {
  const chapterItems = posts.map((_, i) =>
    `    <item id="chapter${i}" href="chapter${i}.xhtml" media-type="application/xhtml+xml"/>`
  ).join('\n');

  const imageItems = Array.from(imageMap.values())
    .filter(info => info.data) // Only include successfully downloaded images
    .map((info, i) =>
      `    <item id="image${i}" href="images/${info.filename}" media-type="${info.mediaType}"/>`
    ).join('\n');

  const manifestItems = chapterItems + (imageItems ? '\n' + imageItems : '');

  const spineItems = posts.map((_, i) =>
    `    <itemref idref="chapter${i}"/>`
  ).join('\n');

  const author = posts[0]?.blogName || 'Unknown';
  const date = new Date().toISOString().split('T')[0];

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="BookId">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:identifier id="BookId">${bookId}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:creator>${escapeXml(author)}</dc:creator>
    <dc:language>en</dc:language>
    <dc:date>${date}</dc:date>
    <dc:publisher>Speed Reader - Tumblr Export</dc:publisher>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="css" href="stylesheet.css" media-type="text/css"/>
${manifestItems}
  </manifest>
  <spine toc="ncx">
${spineItems}
  </spine>
</package>`;
}

/**
 * Generate toc.ncx (NCX navigation)
 */
function generateTocNcx(posts: TumblrPost[], title: string, bookId: string): string {
  const navPoints = posts.map((post, i) => {
    const chapterTitle = post.title || `Post ${i + 1}`;
    return `    <navPoint id="navPoint${i + 1}" playOrder="${i + 1}">
      <navLabel>
        <text>${escapeXml(chapterTitle)}</text>
      </navLabel>
      <content src="chapter${i}.xhtml"/>
    </navPoint>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${bookId}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle>
    <text>${escapeXml(title)}</text>
  </docTitle>
  <navMap>
${navPoints}
  </navMap>
</ncx>`;
}

/**
 * Generate nav.xhtml (EPUB 3 navigation)
 */
function generateNavXhtml(posts: TumblrPost[], title: string): string {
  const navItems = posts.map((post, i) => {
    const chapterTitle = post.title || `Post ${i + 1}`;
    return `        <li><a href="chapter${i}.xhtml">${escapeXml(chapterTitle)}</a></li>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>${escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="stylesheet.css"/>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Table of Contents</h1>
    <ol>
${navItems}
    </ol>
  </nav>
</body>
</html>`;
}

/**
 * Generate stylesheet.css
 */
function generateStylesheet(): string {
  return `/* Tumblr Export Stylesheet */
body {
  font-family: Georgia, serif;
  font-size: 1rem;
  line-height: 1.7;
  margin: 1em;
  max-width: 40em;
}

h1 {
  font-size: 1.5em;
  margin-top: 1em;
  margin-bottom: 0.5em;
}

h2 {
  font-size: 1.25em;
  margin-top: 1em;
  margin-bottom: 0.5em;
}

p {
  margin: 0 0 1em 0;
  text-align: justify;
}

img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 1em auto;
}

blockquote {
  margin: 1em 0;
  padding: 0.5em 1em;
  border-left: 3px solid #999;
  font-style: italic;
  color: #444;
}

.reblog-trail {
  border-left: 3px solid #ccc;
  padding-left: 1em;
  margin-bottom: 1.5em;
}

.reblog-entry {
  margin-bottom: 1em;
  padding-bottom: 0.5em;
  border-bottom: 1px solid #eee;
}

.reblog-entry:last-child {
  border-bottom: none;
}

.reblog-author {
  font-weight: bold;
  color: #666;
  margin-bottom: 0.5em;
}

.post-author {
  font-weight: bold;
  margin-bottom: 0.75em;
  padding-bottom: 0.5em;
  border-bottom: 1px solid #eee;
}

.post-meta {
  font-size: 0.9em;
  color: #888;
  margin-top: 2em;
}

.tags {
  font-style: italic;
}

a {
  color: #0066cc;
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}
`;
}

/**
 * Render a post to XHTML
 */
function renderPostToXhtml(
  post: TumblrPost,
  index: number,
  imageMap: Map<string, ImageInfo>
): string {
  const chapterTitle = post.title || `Post ${index + 1}`;

  // Render reblog trail
  const reblogHtml = post.reblogTrail.length > 0
    ? `<div class="reblog-trail">
${post.reblogTrail.map(entry => renderReblogEntry(entry, imageMap)).join('\n')}
</div>`
    : '';

  // Render main content
  const mainContent = post.content.map(block => blockToXhtml(block, imageMap)).join('\n');

  // Post metadata
  const dateStr = new Date(post.timestamp * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const tagsHtml = post.tags.length > 0
    ? `<p class="tags">Tags: ${post.tags.map(t => `#${escapeXml(t)}`).join(', ')}</p>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${escapeXml(chapterTitle)}</title>
  <link rel="stylesheet" type="text/css" href="stylesheet.css"/>
</head>
<body>
  <h1>${escapeXml(chapterTitle)}</h1>
${reblogHtml}
  <div class="main-content">
    <p class="post-author"><strong>${escapeXml(post.blogName)}</strong></p>
${mainContent}
  </div>
  <div class="post-meta">
    <p>Posted: ${dateStr}</p>
    ${tagsHtml}
  </div>
</body>
</html>`;
}

/**
 * Render a reblog entry
 */
function renderReblogEntry(entry: ReblogEntry, imageMap: Map<string, ImageInfo>): string {
  const content = entry.content.map(b => blockToXhtml(b, imageMap)).join('\n');
  return `    <div class="reblog-entry">
      <p class="reblog-author">${escapeXml(entry.blogName)}:</p>
${content}
    </div>`;
}

/**
 * Convert a content block to XHTML
 */
function blockToXhtml(block: TumblrContentBlock, imageMap: Map<string, ImageInfo>): string {
  switch (block.type) {
    case 'heading1':
      return `      <h1>${escapeXml(block.text || '')}</h1>`;
    case 'heading2':
      return `      <h2>${escapeXml(block.text || '')}</h2>`;
    case 'image':
      if (!block.url) return '';
      // Use local image if downloaded, otherwise fall back to URL
      const imageInfo = imageMap.get(block.url);
      if (imageInfo?.data) {
        return `      <p><img src="images/${imageInfo.filename}" alt=""/></p>`;
      }
      // Fallback to external URL (may not work in all readers)
      return `      <p><img src="${escapeXml(block.url)}" alt=""/></p>`;
    case 'link':
      return block.url
        ? `      <p><a href="${escapeXml(block.url)}">${escapeXml(block.text || block.url)}</a></p>`
        : `      <p>${escapeXml(block.text || '')}</p>`;
    case 'video':
    case 'audio':
      // These can't be embedded easily, just note them
      return `      <p><em>[${block.type}: ${escapeXml(block.url || 'embedded content')}]</em></p>`;
    case 'text':
    default:
      // Text may contain HTML formatting from the parser
      // We need to be careful here - pass through known safe HTML
      return `      <p>${sanitizeHtml(block.text || '')}</p>`;
  }
}

/**
 * Escape special XML characters
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Sanitize HTML for XHTML output
 * Keeps basic formatting tags, strips Tumblr-specific markup
 */
function sanitizeHtml(html: string): string {
  let result = html;
  const placeholders: { placeholder: string; original: string }[] = [];

  // Convert <i> to <em> and <b> to <strong> for semantic HTML
  result = result.replace(/<i(\s[^>]*)?>/gi, '<em>');
  result = result.replace(/<\/i>/gi, '</em>');
  result = result.replace(/<b(\s[^>]*)?>/gi, '<strong>');
  result = result.replace(/<\/b>/gi, '</strong>');

  // Strip span tags but keep their content (Tumblr uses spans for colors/styling)
  result = result.replace(/<span[^>]*>/gi, '');
  result = result.replace(/<\/span>/gi, '');

  // Handle <br> tags first - convert to placeholder immediately
  result = result.replace(/<br\s*\/?>/gi, () => {
    const placeholder = `__PH${placeholders.length}__`;
    placeholders.push({ placeholder, original: '<br/>' });
    return placeholder;
  });

  // Allowed tags that we'll preserve (br already handled above)
  const allowedTags = ['strong', 'em', 's', 'u', 'a', 'blockquote'];

  // Store allowed tags with placeholders
  for (const tag of allowedTags) {
    // Opening tags (with attributes for <a>)
    const openRegex = new RegExp(`<${tag}(\\s[^>]*)?>`, 'gi');
    result = result.replace(openRegex, (match) => {
      const placeholder = `__PH${placeholders.length}__`;
      // For <a> tags, keep href but escape it properly
      if (tag === 'a') {
        const hrefMatch = match.match(/href="([^"]*)"/i);
        if (hrefMatch) {
          placeholders.push({ placeholder, original: `<a href="${escapeXml(hrefMatch[1])}">` });
        } else {
          placeholders.push({ placeholder, original: '<a>' });
        }
      } else {
        placeholders.push({ placeholder, original: `<${tag}>` });
      }
      return placeholder;
    });

    // Closing tags
    const closeRegex = new RegExp(`</${tag}>`, 'gi');
    result = result.replace(closeRegex, () => {
      const placeholder = `__PH${placeholders.length}__`;
      placeholders.push({ placeholder, original: `</${tag}>` });
      return placeholder;
    });
  }

  // Escape all remaining HTML/special chars
  result = escapeXml(result);

  // Restore allowed tags
  for (const { placeholder, original } of placeholders) {
    result = result.replace(placeholder, original);
  }

  return result;
}
