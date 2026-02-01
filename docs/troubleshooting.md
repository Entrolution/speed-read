# Troubleshooting

Common issues and solutions when using Speed-Read.

## CORS Errors

### Problem
```
Error: Unable to load file due to cross-origin restrictions
```

### Cause
The server hosting your document files doesn't allow cross-origin requests from your website.

### Solutions

**Option 1: Configure CORS headers on your server**

Add these headers to responses for your document files:

```
Access-Control-Allow-Origin: https://your-website.com
Access-Control-Allow-Methods: GET
Access-Control-Allow-Headers: Content-Type
```

**Option 2: Use a proxy**

Route requests through your own backend:

```javascript
// Instead of loading directly from external URL
<speed-reader src="https://external-site.com/book.epub" />

// Proxy through your backend
<speed-reader src="/api/proxy?url=https://external-site.com/book.epub" />
```

**Option 3: Use File input**

Let users select files from their device (no CORS issues):

```html
<input type="file" id="picker" accept=".epub,.pdf,.cbz" />
<speed-reader id="reader"></speed-reader>

<script>
  document.getElementById('picker').onchange = (e) => {
    document.getElementById('reader').loadFile(e.target.files[0]);
  };
</script>
```

### Server-Specific CORS Configuration

#### Nginx
```nginx
location /books/ {
    add_header Access-Control-Allow-Origin *;
    add_header Access-Control-Allow-Methods GET;
}
```

#### Apache (.htaccess)
```apache
<FilesMatch "\.(epub|pdf|cbz)$">
    Header set Access-Control-Allow-Origin "*"
</FilesMatch>
```

#### Express.js
```javascript
const cors = require('cors');
app.use('/books', cors(), express.static('books'));
```

#### Cloudflare Workers
```javascript
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const response = await fetch(request);
  const newHeaders = new Headers(response.headers);
  newHeaders.set('Access-Control-Allow-Origin', '*');
  return new Response(response.body, {
    status: response.status,
    headers: newHeaders
  });
}
```

---

## DRM Protected Files

### Problem
```
Error: This file contains DRM protection and cannot be viewed
```

### Cause
The file has digital rights management (DRM) encryption that prevents unauthorized viewing.

### Solution
DRM-protected files cannot be opened in Speed-Read by design. Use the authorized app from your content provider (Kindle, Kobo, Adobe Digital Editions, etc.).

### Types Detected
- Adobe ADEPT (EPUB)
- Readium LCP (EPUB)
- Password-protected PDF
- Adobe PDF DRM

---

## File Format Errors

### Problem
```
Error: Unrecognized file format
```

### Cause
The file extension doesn't match supported formats, or the file is corrupted.

### Solutions

1. **Verify the file extension**: Must be `.epub`, `.pdf`, or `.cbz`
2. **Check file integrity**: Try opening in another reader
3. **Re-download the file**: May have been corrupted during transfer

### Supported Formats
| Extension | Format | Notes |
|-----------|--------|-------|
| `.epub` | EPUB 2/3 | Most common ebook format |
| `.pdf` | PDF 1.0+ | Portable Document Format |
| `.cbz` | Comic Book ZIP | ZIP archive of images |

---

## File Too Large

### Problem
```
Error: File size exceeds limit
```

### Limits
| Format | Max Size |
|--------|----------|
| EPUB | 100 MB |
| PDF | 50 MB |
| CBZ | 200 MB |

### Solutions

1. **Compress the file** if possible
2. **Split into chapters** using the manifest feature
3. For CBZ: reduce image resolution

---

## Blank/White Screen

### Problem
The reader shows but content doesn't appear.

### Solutions

1. **Check browser console** for JavaScript errors
2. **Verify the file** loads in other readers
3. **Check container height**: The reader needs a defined height

```css
/* Bad - no height */
speed-reader { }

/* Good - explicit height */
speed-reader {
  height: 600px;
}

/* Good - viewport height */
speed-reader {
  height: 100vh;
}
```

---

## Slow Loading

### Cause
Large files or slow network.

### Solutions

1. **Use smaller files** when possible
2. **Host files on CDN** for faster delivery
3. **Enable caching** on your server
4. For serial content, use **manifest mode** to load chapters on demand

---

## Touch/Swipe Not Working

### Solutions

1. **Check container size**: Must have visible area to swipe
2. **Verify touch events**: Not blocked by parent elements
3. **Check passive listeners**: Some frameworks interfere with touch

---

## Keyboard Navigation Not Working

### Solutions

1. **Click the reader first**: It needs focus for keyboard events
2. **Check for event conflicts**: Other components may capture arrow keys
3. **Verify tabindex**: Container should be focusable

```html
<!-- Focusable container -->
<speed-reader tabindex="0" src="/book.epub"></speed-reader>
```

---

## Still Having Issues?

1. Check the [GitHub Issues](https://github.com/gvonness-apolitical/speed-read/issues) for similar problems
2. Open a new issue with:
   - Browser and version
   - Error message (from console)
   - Sample file (if shareable)
   - Minimal reproduction code
