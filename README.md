# Speed-Read

Lightweight, embeddable document reader for EPUB, PDF, CBZ, and Tumblr posts. Add a reader to any webpage in one line of code.

[![npm](https://img.shields.io/npm/v/@entrolution/speed-read)](https://www.npmjs.com/package/@entrolution/speed-read)
[![CI](https://github.com/entrolution/speed-read/actions/workflows/ci.yml/badge.svg)](https://github.com/entrolution/speed-read/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Lightweight**: ~13KB initial load, format libraries loaded on-demand
- **Multi-format**: EPUB, PDF, CBZ, and Tumblr post support
- **Dual export**: Web Component and React
- **Episodic content**: Chapter manifest support for serial content
- **Tumblr series**: Navigate through linked Tumblr post series with caching
- **Themeable**: CSS custom properties for styling
- **Accessible**: Keyboard and touch navigation

## Quick Start

### HTML (CDN)

```html
<script src="https://cdn.jsdelivr.net/npm/@entrolution/speed-read@latest"></script>
<speed-reader src="/book.epub"></speed-reader>
```

### React

```jsx
import { Reader } from '@entrolution/speed-read/react';

function App() {
  return (
    <Reader
      src="/book.epub"
      onPageChange={(page, total) => console.log(`Page ${page}/${total}`)}
    />
  );
}
```

### Episodic Content

```html
<speed-reader manifest="/chapters.json"></speed-reader>
```

```json
{
  "title": "My Web Novel",
  "chapters": [
    { "src": "/chapters/ch1.epub", "title": "The Beginning" },
    { "src": "/chapters/ch2.epub", "title": "The Journey" }
  ]
}
```

### Tumblr Posts

Read Tumblr post series with automatic navigation between linked posts:

```html
<speed-reader tumblr="https://www.tumblr.com/username/post-id/slug"></speed-reader>
```

Posts are fetched via CORS proxy and cached locally. Use a custom proxy if needed:

```html
<speed-reader
  tumblr="https://www.tumblr.com/username/post-id/slug"
  tumblr-proxy="https://my-cors-proxy.com/?url=">
</speed-reader>
```

## Installation

```bash
npm install @entrolution/speed-read
```

Or use via CDN:

```html
<script src="https://cdn.jsdelivr.net/npm/@entrolution/speed-read@latest"></script>
```

## Usage

### Web Component

```html
<!-- From URL -->
<speed-reader src="/path/to/book.epub"></speed-reader>

<!-- With manifest -->
<speed-reader manifest="/chapters.json"></speed-reader>
```

#### Attributes

| Attribute | Type | Description |
|-----------|------|-------------|
| `src` | string | URL to document file |
| `manifest` | string | URL to chapters manifest |
| `tumblr` | string | Tumblr post URL |
| `tumblr-proxy` | string | Custom CORS proxy URL (optional) |

#### Events

| Event | Detail | Description |
|-------|--------|-------------|
| `ready` | - | Document loaded and ready |
| `pagechange` | `{ page, total }` | Page navigation occurred |
| `chapterchange` | `{ chapter, total }` | Chapter changed (manifest mode) |
| `error` | `ReaderError` | Error occurred |

### React Component

```jsx
import { Reader } from '@entrolution/speed-read/react';

function App() {
  return (
    <Reader
      src="/book.epub"
      onReady={() => console.log('Ready!')}
      onPageChange={(page, total) => console.log(`${page}/${total}`)}
      onError={(error) => console.error(error)}
    />
  );
}
```

#### Props

| Prop | Type | Description |
|------|------|-------------|
| `src` | `string \| File \| Blob` | Document source |
| `manifest` | `string` | Manifest URL |
| `tumblr` | `string` | Tumblr post URL |
| `tumblrProxy` | `string` | Custom CORS proxy URL |
| `onReady` | `() => void` | Called when ready |
| `onPageChange` | `(page, total) => void` | Page change callback |
| `onChapterChange` | `(chapter, total) => void` | Chapter change callback |
| `onError` | `(error) => void` | Error callback |
| `className` | `string` | CSS class name |
| `style` | `CSSProperties` | Inline styles |

### Loading Files Directly

Both components support loading files from `File` or `Blob` objects:

```jsx
// React
const readerRef = useRef();
const handleFile = (file) => {
  readerRef.current.loadFile(file);
};

<Reader ref={readerRef} />
```

```javascript
// Web Component
const reader = document.querySelector('speed-reader');
reader.loadFile(file);
```

## Theming

Style the reader with CSS custom properties:

```css
speed-reader {
  --speed-reader-bg: #ffffff;
  --speed-reader-text: #000000;
  --speed-reader-accent: #0066cc;
  --speed-reader-error-bg: #fff0f0;
  --speed-reader-error-text: #cc0000;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  speed-reader {
    --speed-reader-bg: #1a1a1a;
    --speed-reader-text: #e0e0e0;
    --speed-reader-accent: #66b3ff;
  }
}
```

## Keyboard Navigation

| Key | Action |
|-----|--------|
| `Arrow Right` / `Arrow Down` / `Space` | Next page |
| `Arrow Left` / `Arrow Up` | Previous page |
| `Home` | First page |
| `End` | Last page |

## Supported Formats

| Format | Extension | Library |
|--------|-----------|---------|
| EPUB | `.epub` | foliate-js |
| PDF | `.pdf` | pdf.js |
| CBZ | `.cbz` | JSZip + Web Worker |
| Tumblr | URL | CORS proxy + caching |

## Bundle Size

| Module | Gzipped |
|--------|---------|
| Core | ~8KB |
| + EPUB | ~80KB |
| + PDF | ~200KB |
| + CBZ | ~30KB |
| + Tumblr | ~8KB |

Format libraries are loaded dynamically, only when needed.

## DRM Protection

DRM-protected files are detected and blocked with a clear message. The reader supports:

- Adobe ADEPT (EPUB)
- Readium LCP (EPUB)
- Password-protected PDFs
- Adobe PDF DRM

## Browser Support

- Chrome 80+
- Firefox 78+
- Safari 14+
- Edge 80+

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Run tests
npm test

# Build
npm run build
```

## Roadmap

See [ROADMAP.md](ROADMAP.md) for planned features including:
- Table of Contents & Search
- Bookmarks & Annotations
- Themes & Typography controls
- Offline/PWA support

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history.
