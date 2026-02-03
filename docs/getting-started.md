# Getting Started

This guide will help you add Speed-Read to your project.

## Installation

### Via npm

```bash
npm install @entrolution/speed-read
```

### Via CDN

```html
<script src="https://cdn.jsdelivr.net/npm/@entrolution/speed-read@latest"></script>
```

Or with a specific version:

```html
<script src="https://cdn.jsdelivr.net/npm/@entrolution/speed-read@0.1.0"></script>
```

## Basic Usage

### Web Component

The simplest way to use Speed-Read is with the Web Component:

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://cdn.jsdelivr.net/npm/@entrolution/speed-read@latest"></script>
  <style>
    speed-reader {
      width: 100%;
      height: 600px;
    }
  </style>
</head>
<body>
  <speed-reader src="/path/to/book.epub"></speed-reader>
</body>
</html>
```

### React Component

```jsx
import { Reader } from '@entrolution/speed-read/react';

function App() {
  return (
    <div style={{ height: '600px' }}>
      <Reader
        src="/path/to/book.epub"
        onReady={() => console.log('Document ready')}
        onPageChange={(page, total) => {
          console.log(`Page ${page} of ${total}`);
        }}
        onError={(error) => {
          console.error('Reader error:', error);
        }}
      />
    </div>
  );
}

export default App;
```

## Loading Files

### From URL

```html
<speed-reader src="https://example.com/book.epub"></speed-reader>
```

**Note:** The server must allow CORS requests from your domain.

### From File Input

```html
<input type="file" id="fileInput" accept=".epub,.pdf,.cbz">
<speed-reader id="reader"></speed-reader>

<script>
  const input = document.getElementById('fileInput');
  const reader = document.getElementById('reader');

  input.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      reader.loadFile(file);
    }
  });
</script>
```

### From Drag and Drop

```html
<div id="dropzone">Drop file here</div>
<speed-reader id="reader"></speed-reader>

<script>
  const dropzone = document.getElementById('dropzone');
  const reader = document.getElementById('reader');

  dropzone.addEventListener('dragover', (e) => e.preventDefault());

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      reader.loadFile(file);
    }
  });
</script>
```

## Episodic Content

For serial content like web novels or webcomics, use a manifest:

### Create a manifest file (chapters.json)

```json
{
  "title": "My Web Novel",
  "chapters": [
    { "src": "/chapters/ch1.epub", "title": "Chapter 1: The Beginning" },
    { "src": "/chapters/ch2.epub", "title": "Chapter 2: The Journey" },
    { "src": "/chapters/ch3.pdf", "title": "Chapter 3: The End" }
  ]
}
```

### Use the manifest

```html
<speed-reader manifest="/chapters.json"></speed-reader>
```

The reader will:
- Load chapters on demand
- Navigate seamlessly between chapters
- Preload adjacent chapters for smooth navigation
- Support mixed formats (EPUB and PDF in the same series)

## Theming

Speed-Read supports theming via CSS custom properties. See the [README](../README.md#theming) for available properties and dark mode examples.

## Handling Events

### Web Component

```javascript
const reader = document.querySelector('speed-reader');

reader.addEventListener('ready', () => {
  console.log('Document loaded');
});

reader.addEventListener('pagechange', (e) => {
  console.log(`Page ${e.detail.page} of ${e.detail.total}`);
});

reader.addEventListener('chapterchange', (e) => {
  console.log(`Chapter ${e.detail.chapter} of ${e.detail.total}`);
});

reader.addEventListener('error', (e) => {
  console.error(e.detail.message);
});
```

### React

```jsx
<Reader
  src="/book.epub"
  onReady={() => console.log('Ready')}
  onPageChange={(page, total) => console.log(`${page}/${total}`)}
  onChapterChange={(chapter, total) => console.log(`Ch ${chapter}`)}
  onError={(error) => console.error(error.message)}
/>
```

## Error Handling

The reader detects and reports various error conditions:

| Error Type | Description |
|------------|-------------|
| `FILE_TOO_LARGE` | File exceeds size limit |
| `INVALID_FORMAT` | Unrecognized file format |
| `DRM_PROTECTED` | File has DRM protection |
| `LOAD_FAILED` | Network or parsing error |
| `CORS_ERROR` | Cross-origin request blocked |

### Example error handler

```javascript
reader.addEventListener('error', (e) => {
  const error = e.detail;

  switch (error.type) {
    case 'DRM_PROTECTED':
      alert('This file is DRM protected and cannot be opened.');
      break;
    case 'CORS_ERROR':
      alert('Cannot load file due to CORS restrictions.');
      break;
    default:
      alert(`Error: ${error.message}`);
  }
});
```

## Next Steps

- See the [API Reference](./api-reference.md) for complete documentation
- Check out the [demo](https://entrolution.github.io/speed-read/) for live examples
- Having issues? See [Troubleshooting](./troubleshooting.md)
