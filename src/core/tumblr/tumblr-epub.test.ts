import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateEpub } from './tumblr-epub';
import type { TumblrPost } from '@/types';

// Mock JSZip
const mockFile = vi.fn();
const mockGenerateAsync = vi.fn();

vi.mock('jszip', () => ({
  default: class MockJSZip {
    file = mockFile;
    generateAsync = mockGenerateAsync;
  },
}));

const createMockPost = (id: string, title?: string): TumblrPost => ({
  id,
  title,
  content: [
    { type: 'text', text: 'This is a test post.' },
    { type: 'heading1', text: 'Chapter Heading' },
    { type: 'image', url: 'https://example.com/image.jpg' },
  ],
  reblogTrail: [
    {
      blogName: 'original-author',
      blogUrl: 'https://original-author.tumblr.com',
      content: [{ type: 'text', text: 'Original content' }],
      timestamp: 1234567890,
    },
  ],
  blogName: 'test-blog',
  blogUrl: 'https://test-blog.tumblr.com',
  timestamp: Date.now() / 1000,
  tags: ['test', 'demo'],
});

describe('generateEpub', () => {
  beforeEach(() => {
    mockFile.mockClear();
    mockGenerateAsync.mockClear();
    mockGenerateAsync.mockResolvedValue(new Blob(['test'], { type: 'application/epub+zip' }));
  });

  it('should generate a valid EPUB blob', async () => {
    const posts = [createMockPost('1', 'Test Post')];
    const result = await generateEpub(posts, 'Test Export');

    expect(result).toBeInstanceOf(Blob);
  });

  it('should create mimetype file first', async () => {
    const posts = [createMockPost('1')];
    await generateEpub(posts, 'Test');

    expect(mockFile).toHaveBeenCalledWith('mimetype', 'application/epub+zip', { compression: 'STORE' });
  });

  it('should create container.xml in META-INF', async () => {
    const posts = [createMockPost('1')];
    await generateEpub(posts, 'Test');

    expect(mockFile).toHaveBeenCalledWith(
      'META-INF/container.xml',
      expect.stringContaining('rootfile full-path="OEBPS/content.opf"')
    );
  });

  it('should create content.opf with correct metadata', async () => {
    const posts = [createMockPost('1', 'My Post')];
    await generateEpub(posts, 'My Export Title');

    expect(mockFile).toHaveBeenCalledWith(
      'OEBPS/content.opf',
      expect.stringContaining('<dc:title>My Export Title</dc:title>')
    );
  });

  it('should create chapter files for each post', async () => {
    const posts = [
      createMockPost('1', 'Post 1'),
      createMockPost('2', 'Post 2'),
    ];
    await generateEpub(posts, 'Test');

    expect(mockFile).toHaveBeenCalledWith('OEBPS/chapter0.xhtml', expect.any(String));
    expect(mockFile).toHaveBeenCalledWith('OEBPS/chapter1.xhtml', expect.any(String));
  });

  it('should include reblog trail in chapter content', async () => {
    const posts = [createMockPost('1')];
    await generateEpub(posts, 'Test');

    // Find the chapter file call
    const chapterCall = mockFile.mock.calls.find(call => call[0] === 'OEBPS/chapter0.xhtml');
    expect(chapterCall).toBeDefined();
    expect(chapterCall[1]).toContain('original-author');
    expect(chapterCall[1]).toContain('Original content');
  });

  it('should create navigation files', async () => {
    const posts = [createMockPost('1')];
    await generateEpub(posts, 'Test');

    expect(mockFile).toHaveBeenCalledWith('OEBPS/nav.xhtml', expect.any(String));
    expect(mockFile).toHaveBeenCalledWith('OEBPS/toc.ncx', expect.any(String));
  });

  it('should create stylesheet', async () => {
    const posts = [createMockPost('1')];
    await generateEpub(posts, 'Test');

    expect(mockFile).toHaveBeenCalledWith('OEBPS/stylesheet.css', expect.any(String));
  });

  it('should escape special XML characters', async () => {
    const post = createMockPost('1', 'Test & "Quotes" <Tags>');
    await generateEpub([post], 'Export <Test>');

    // The title should be escaped
    expect(mockFile).toHaveBeenCalledWith(
      'OEBPS/content.opf',
      expect.stringContaining('&lt;Test&gt;')
    );
  });

  it('should handle posts without titles', async () => {
    const post = createMockPost('1'); // No title
    await generateEpub([post], 'Test');

    // Should use "Post 1" as default
    const chapterCall = mockFile.mock.calls.find(call => call[0] === 'OEBPS/chapter0.xhtml');
    expect(chapterCall[1]).toContain('Post 1');
  });

  it('should generate with DEFLATE compression', async () => {
    const posts = [createMockPost('1')];
    await generateEpub(posts, 'Test');

    expect(mockGenerateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'blob',
        mimeType: 'application/epub+zip',
        compression: 'DEFLATE',
      })
    );
  });
});
