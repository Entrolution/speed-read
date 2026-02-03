# API Reference

## Web Component: `<speed-reader>`

### Attributes

| Attribute | Type | Description |
|-----------|------|-------------|
| `src` | `string` | URL to the document file (EPUB, PDF, or CBZ) |
| `manifest` | `string` | URL to a chapters.json manifest for episodic content |

### Methods

#### `loadFile(file: File | Blob): Promise<void>`

Load a document from a File or Blob object directly.

```javascript
const reader = document.querySelector('speed-reader');
const file = document.getElementById('fileInput').files[0];
await reader.loadFile(file);
```

### Events

#### `ready`

Fired when the document is loaded and ready to display.

```javascript
reader.addEventListener('ready', () => {
  console.log('Document ready');
});
```

#### `pagechange`

Fired when the current page changes.

```javascript
reader.addEventListener('pagechange', (e) => {
  const { page, total } = e.detail;
  console.log(`Page ${page} of ${total}`);
});
```

#### `chapterchange`

Fired when the current chapter changes (manifest mode only).

```javascript
reader.addEventListener('chapterchange', (e) => {
  const { chapter, total } = e.detail;
  console.log(`Chapter ${chapter} of ${total}`);
});
```

#### `error`

Fired when an error occurs.

```javascript
reader.addEventListener('error', (e) => {
  const error = e.detail;
  console.error(error.type, error.message);
});
```

### CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--speed-reader-bg` | `#ffffff` | Background color |
| `--speed-reader-text` | `#000000` | Text color |
| `--speed-reader-accent` | `#0066cc` | Accent color (buttons) |
| `--speed-reader-error-bg` | `#fff0f0` | Error background |
| `--speed-reader-error-text` | `#cc0000` | Error text color |

### CSS Parts

| Part | Description |
|------|-------------|
| `container` | Main container element |
| `controls` | Navigation controls bar |

```css
speed-reader::part(controls) {
  background: #f0f0f0;
  border-top: 2px solid #ccc;
}
```

---

## React Component: `<Reader />`

### Props

| Prop | Type | Description |
|------|------|-------------|
| `src` | `string \| File \| Blob` | Document source |
| `manifest` | `string` | URL to chapters manifest |
| `onReady` | `() => void` | Called when document is ready |
| `onPageChange` | `(page: number, total: number) => void` | Page change callback |
| `onChapterChange` | `(chapter: number, total: number) => void` | Chapter change callback |
| `onError` | `(error: ReaderError) => void` | Error callback |
| `className` | `string` | CSS class name |
| `style` | `React.CSSProperties` | Inline styles |

### Ref Methods

Access via `useRef`:

```jsx
const readerRef = useRef();

// Later:
readerRef.current.next();
readerRef.current.prev();
readerRef.current.goTo(5);
readerRef.current.loadFile(file);
readerRef.current.getNavigation();
```

| Method | Description |
|--------|-------------|
| `next()` | Navigate to next page |
| `prev()` | Navigate to previous page |
| `goTo(page: number)` | Navigate to specific page |
| `loadFile(file: File \| Blob)` | Load a file directly |
| `getNavigation()` | Get navigation state |

---

## Types

### ReaderError

```typescript
interface ReaderError {
  type: ReaderErrorType;
  message: string;
  format?: DocumentFormat;
  details?: unknown;
}

type ReaderErrorType =
  | 'FILE_TOO_LARGE'
  | 'INVALID_FORMAT'
  | 'DRM_PROTECTED'
  | 'LOAD_FAILED'
  | 'CORS_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'MALFORMED_FILE'
  | 'RENDER_ERROR'
  | 'UNKNOWN';

type DocumentFormat = 'epub' | 'pdf' | 'cbz';
```

### Manifest

```typescript
interface Manifest {
  title: string;
  chapters: ManifestChapter[];
}

interface ManifestChapter {
  src: string;
  title: string;
}
```

### ReaderNavigation

```typescript
interface ReaderNavigation {
  next(): Promise<void>;
  prev(): Promise<void>;
  goTo(page: number): Promise<void>;
  currentPage: number;
  totalPages: number;
}
```

---

## Advanced: Core Engine

For advanced use cases, you can use the core engine directly:

```typescript
import { ReaderEngine } from 'speed-read';

const engine = new ReaderEngine();

await engine.init(containerElement, {
  src: '/book.epub',
  onReady: () => console.log('Ready'),
  onPageChange: (page, total) => console.log(`${page}/${total}`),
  onError: (error) => console.error(error),
});

// Navigation
await engine.next();
await engine.prev();

// Get navigation state
const nav = engine.getNavigation();
console.log(nav.currentPage, nav.totalPages);

// Cleanup
engine.destroy();
```

---

## Validation Utilities

Validate files before loading:

```typescript
import { validateFile, detectFormat, checkDRM } from 'speed-read';

// Detect format from magic bytes
const format = detectFormat(arrayBuffer);
console.log(format); // 'epub', 'pdf', 'cbz', or null

// Full validation (format, size, DRM)
const result = validateFile(arrayBuffer);
if (result.valid) {
  console.log('Format:', result.format);
} else {
  console.error('Invalid:', result.error.message);
}

// Check for DRM specifically
const drmResult = checkDRM(arrayBuffer, 'epub');
if (drmResult.hasDRM) {
  console.log('DRM type:', drmResult.type);
}
```

---

## File Size Limits

| Format | Limit |
|--------|-------|
| EPUB | 100 MB |
| PDF | 50 MB |
| CBZ | 200 MB |
