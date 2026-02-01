# Sample Files for Testing

These files are provided for testing Speed-Read functionality.

## Files

| File | Format | Source | License |
|------|--------|--------|---------|
| `alice.epub` | EPUB | Project Gutenberg | Public Domain |
| `sample.pdf` | PDF | africau.edu | Public Domain |
| `sample.cbz` | CBZ | Lorem Picsum images | Unsplash License |

## Usage

### Local Development

```bash
npm run dev
```

Then open the demo page and drag-drop any of these files.

### Programmatic Testing

```javascript
// Fetch and load a sample
const response = await fetch('/samples/alice.epub');
const blob = await response.blob();
reader.loadFile(blob);
```

## Adding More Samples

When adding test files:
1. Ensure they are freely licensed (public domain, CC0, or similar)
2. Keep file sizes reasonable (< 10MB)
3. Document the source and license in this README
