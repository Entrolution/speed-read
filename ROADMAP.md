# Speed-Read Roadmap

## Phase 1: Release Preparation
**Goal:** Make the library publicly available and usable

### 1.1 GitHub Configuration
- [x] Enable GitHub Pages (Settings → Pages → Source: GitHub Actions)
- [x] Configure branch protection rules for `main`
- [x] Set up npm Trusted Publishing (OIDC) for automated releases

### 1.2 First Release
- [ ] Manual testing with sample files:
  - [ ] EPUB: Standard novels, technical books with images
  - [ ] PDF: Text-based, scanned documents, forms
  - [ ] CBZ: Comic archives with various image formats
- [ ] Test DRM detection with protected samples
- [x] Verify demo site works after GitHub Pages deployment
- [x] Tag and publish v0.1.0 to npm
- [x] Verify CDN availability (jsdelivr)

### 1.3 Documentation Polish
- [x] Add live examples to demo site
- [x] Create sample files for testing (small, open-licensed)
- [x] Add troubleshooting section to docs
- [x] Add CORS setup guide with common server examples

---

## Phase 2: Core Improvements
**Goal:** Improve reliability and developer experience

### 2.1 Error Handling & Edge Cases
- [x] Improve error messages with actionable guidance
- [x] Add retry logic for network failures
- [x] Handle malformed files gracefully
- [x] Add loading progress indicator
- [ ] Memory leak audit and fixes

### 2.2 Accessibility
- [x] Full keyboard navigation (focus management)
- [x] ARIA labels and roles
- [ ] Screen reader testing
- [x] High contrast mode support
- [x] Reduced motion support

### 2.3 Performance
- [ ] Canvas pooling for PDF/CBZ
- [ ] Image lazy loading for CBZ
- [ ] Preload adjacent pages
- [ ] Web Worker for heavy operations
- [ ] Bundle size optimization audit

### 2.4 Testing
- [x] E2E tests with Playwright
- [ ] Visual regression tests
- [x] Cross-browser testing (Chrome, Firefox, Safari, Edge) - configured in playwright.config.ts
- [x] Mobile browser testing - configured in playwright.config.ts (Pixel 5, iPhone 12)

---

## Phase 3: Reading Experience
**Goal:** Feature parity with dedicated reader apps

### 3.1 Table of Contents
- [ ] Extract TOC from EPUB (NCX/nav)
- [ ] Extract TOC from PDF (outline)
- [ ] Generate TOC for CBZ (folder structure)
- [ ] TOC panel UI component
- [ ] Jump-to-chapter navigation

### 3.2 Search
- [ ] Full-text search in EPUB
- [ ] Text layer search in PDF
- [ ] Search results highlighting
- [ ] Search UI component
- [ ] Keyboard shortcut (Ctrl/Cmd+F)

### 3.3 Text Selection & Copy
- [ ] Enable text selection in EPUB
- [ ] Enable text selection in PDF (text layer)
- [ ] Copy to clipboard
- [ ] Selection highlighting

### 3.4 Zoom & Display
- [ ] Zoom in/out controls
- [ ] Fit-to-width / fit-to-page modes
- [ ] Multi-page spreads (two-page view)
- [ ] Continuous scroll mode
- [ ] Pinch-to-zoom on touch devices

---

## Phase 4: Personalization
**Goal:** Let readers customize their experience

### 4.1 Theme System
- [ ] Light/Dark/Sepia presets
- [ ] Custom theme builder
- [ ] System theme detection (prefers-color-scheme)
- [ ] Per-document theme memory

### 4.2 Typography (EPUB)
- [ ] Font family selection
- [ ] Font size adjustment
- [ ] Line height adjustment
- [ ] Margin/padding controls
- [ ] Text alignment options

### 4.3 Progress & Bookmarks
- [ ] Reading progress bar
- [ ] Auto-save position (localStorage)
- [ ] Manual bookmarks
- [ ] Bookmark list UI
- [ ] Cross-device sync API hooks

### 4.4 Annotations
- [ ] Highlight text (multiple colors)
- [ ] Add notes to highlights
- [ ] Annotations list/export
- [ ] Annotation persistence API

---

## Phase 5: Offline & PWA
**Goal:** Work without internet connection

### 5.1 Service Worker
- [ ] Cache static assets
- [ ] Cache loaded documents
- [ ] Offline fallback UI
- [ ] Background sync for annotations

### 5.2 Storage
- [ ] IndexedDB for large files
- [ ] Storage quota management
- [ ] LRU cache eviction
- [ ] Import/export library

### 5.3 PWA Features
- [ ] Web App Manifest
- [ ] Install prompt
- [ ] Standalone display mode
- [ ] Share target API

---

## Phase 6: Advanced Features
**Goal:** Power user and enterprise features

### 6.1 Print Support
- [ ] Print current page
- [ ] Print page range
- [ ] Print-optimized styles

### 6.2 Analytics Hooks
- [ ] Reading time tracking
- [ ] Page view events
- [ ] Chapter completion events
- [ ] Custom event API

### 6.3 Embedding Options
- [ ] Iframe embed mode
- [ ] Configurable toolbar
- [ ] White-label mode (hide branding)
- [ ] Custom controls slot

### 6.4 Formats Expansion
- [ ] MOBI/KF8 support (via foliate-js)
- [ ] FB2 support
- [ ] CBR (RAR archives)
- [ ] Plain text / Markdown

---

## Version Milestones

| Version | Phase | Key Features |
|---------|-------|--------------|
| 0.1.0 | 1 | Initial release, EPUB/PDF/CBZ support |
| 0.2.0 | 2 | Accessibility, error handling, performance |
| 0.3.0 | 3.1-3.2 | Table of Contents, Search |
| 0.4.0 | 3.3-3.4 | Text selection, Zoom, Spreads |
| 0.5.0 | 4.1-4.2 | Themes, Typography controls |
| 0.6.0 | 4.3-4.4 | Bookmarks, Annotations |
| 0.7.0 | 5 | Offline/PWA support |
| 1.0.0 | 6 | Stable API, all core features |

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to help with these features.

Priority features are tagged with `good first issue` or `help wanted` in GitHub Issues.
