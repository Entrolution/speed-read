import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ReaderEngine } from './engine';
import type { FormatReader, ReaderNavigation, ReaderError } from '@/types';

// Mock validation module
vi.mock('./validation', () => ({
  loadAndValidate: vi.fn(),
  detectFormat: vi.fn(),
}));

// Create shared mock functions for ManifestController
const mockManifestLoad = vi.fn().mockResolvedValue(undefined);
const mockManifestGoToChapter = vi.fn().mockResolvedValue(new ArrayBuffer(100));
const mockManifestNextChapter = vi.fn().mockResolvedValue(null);
const mockManifestPrevChapter = vi.fn().mockResolvedValue(null);
const mockManifestPreloadAdjacent = vi.fn();
const mockManifestSetCallbacks = vi.fn();
const mockManifestDestroy = vi.fn();

// Mock manifest controller with shared mock functions
vi.mock('./manifest-controller', () => ({
  ManifestController: vi.fn().mockImplementation(() => ({
    load: mockManifestLoad,
    goToChapter: mockManifestGoToChapter,
    nextChapter: mockManifestNextChapter,
    prevChapter: mockManifestPrevChapter,
    preloadAdjacent: mockManifestPreloadAdjacent,
    setCallbacks: mockManifestSetCallbacks,
    destroy: mockManifestDestroy,
  })),
}));

// Mock loadReader
vi.mock('@/readers', () => ({
  loadReader: vi.fn(),
}));

// Import mocked modules
import { loadAndValidate, detectFormat } from './validation';
import { loadReader } from '@/readers';

const mockLoadAndValidate = loadAndValidate as ReturnType<typeof vi.fn>;
const mockDetectFormat = detectFormat as ReturnType<typeof vi.fn>;
const mockLoadReader = loadReader as ReturnType<typeof vi.fn>;

// Reset manifest mocks before each test
function resetManifestMocks() {
  mockManifestLoad.mockClear().mockResolvedValue(undefined);
  mockManifestGoToChapter.mockClear().mockResolvedValue(new ArrayBuffer(100));
  mockManifestNextChapter.mockClear().mockResolvedValue(null);
  mockManifestPrevChapter.mockClear().mockResolvedValue(null);
  mockManifestPreloadAdjacent.mockClear();
  mockManifestSetCallbacks.mockClear();
  mockManifestDestroy.mockClear();
}

// Helper to create mock reader
function createMockReader(overrides: Partial<FormatReader> = {}): FormatReader {
  const navigation: ReaderNavigation = {
    currentPage: 1,
    totalPages: 10,
    next: vi.fn().mockResolvedValue(undefined),
    prev: vi.fn().mockResolvedValue(undefined),
    goTo: vi.fn().mockResolvedValue(undefined),
  };

  return {
    load: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
    getNavigation: vi.fn().mockReturnValue(navigation),
    ...overrides,
  };
}

describe('ReaderEngine', () => {
  let engine: ReaderEngine;
  let container: HTMLElement;

  beforeEach(() => {
    engine = new ReaderEngine();
    container = document.createElement('div');
    vi.clearAllMocks();
    resetManifestMocks();
  });

  afterEach(() => {
    engine.destroy();
  });

  describe('init() with src', () => {
    it('should load document from URL source', async () => {
      const mockReader = createMockReader();
      const mockData = new ArrayBuffer(100);

      mockLoadAndValidate.mockResolvedValue({ data: mockData, format: 'pdf' });
      mockLoadReader.mockResolvedValue(mockReader);

      await engine.init(container, { src: '/test.pdf' });

      expect(mockLoadAndValidate).toHaveBeenCalledWith('/test.pdf');
      expect(mockLoadReader).toHaveBeenCalledWith('pdf');
      expect(mockReader.load).toHaveBeenCalledWith(mockData, container);
    });

    it('should load document from File source', async () => {
      const mockReader = createMockReader();
      const mockData = new ArrayBuffer(100);
      const file = new File([mockData], 'test.epub');

      mockLoadAndValidate.mockResolvedValue({ data: mockData, format: 'epub' });
      mockLoadReader.mockResolvedValue(mockReader);

      await engine.init(container, { src: file });

      expect(mockLoadAndValidate).toHaveBeenCalledWith(file);
      expect(mockLoadReader).toHaveBeenCalledWith('epub');
    });

    it('should call onReady callback when loaded', async () => {
      const mockReader = createMockReader();
      mockLoadAndValidate.mockResolvedValue({ data: new ArrayBuffer(100), format: 'pdf' });
      mockLoadReader.mockResolvedValue(mockReader);

      const onReady = vi.fn();
      await engine.init(container, { src: '/test.pdf', onReady });

      expect(onReady).toHaveBeenCalled();
    });

    it('should call onPageChange callback', async () => {
      const setOnPageChangeMock = vi.fn();
      const mockReader = createMockReader();
      (mockReader as unknown as { setOnPageChange: typeof setOnPageChangeMock }).setOnPageChange = setOnPageChangeMock;

      mockLoadAndValidate.mockResolvedValue({ data: new ArrayBuffer(100), format: 'pdf' });
      mockLoadReader.mockResolvedValue(mockReader);

      const onPageChange = vi.fn();
      await engine.init(container, { src: '/test.pdf', onPageChange });

      expect(setOnPageChangeMock).toHaveBeenCalledWith(onPageChange);
    });

    it('should handle validation errors', async () => {
      const error: ReaderError = { type: 'DRM_PROTECTED', message: 'File is DRM protected' };
      mockLoadAndValidate.mockResolvedValue({ error });

      const onError = vi.fn();
      await engine.init(container, { src: '/protected.epub', onError });

      expect(onError).toHaveBeenCalledWith(error);
      expect(container.innerHTML).toContain('Protected Content');
    });

    it('should throw error when no src or manifest provided', async () => {
      const onError = vi.fn();
      await engine.init(container, { onError });

      expect(onError).toHaveBeenCalled();
      expect(onError.mock.calls[0][0].message).toContain('Either src or manifest must be provided');
    });
  });

  describe('init() with manifest', () => {
    it('should load manifest and first chapter', async () => {
      const mockReader = createMockReader();
      const mockData = new ArrayBuffer(100);

      mockDetectFormat.mockReturnValue('epub');
      mockLoadReader.mockResolvedValue(mockReader);
      mockManifestGoToChapter.mockResolvedValue(mockData);

      await engine.init(container, { manifest: '/chapters.json' });

      expect(mockManifestLoad).toHaveBeenCalledWith('/chapters.json');
      expect(mockManifestGoToChapter).toHaveBeenCalledWith(0);
    });

    it('should handle invalid format in first chapter', async () => {
      mockDetectFormat.mockReturnValue(null);

      const onError = vi.fn();
      await engine.init(container, { manifest: '/chapters.json', onError });

      expect(onError).toHaveBeenCalled();
      expect(onError.mock.calls[0][0].type).toBe('INVALID_FORMAT');
    });
  });

  describe('navigation', () => {
    let mockReader: FormatReader;

    beforeEach(async () => {
      mockReader = createMockReader();
      mockLoadAndValidate.mockResolvedValue({ data: new ArrayBuffer(100), format: 'pdf' });
      mockLoadReader.mockResolvedValue(mockReader);

      await engine.init(container, { src: '/test.pdf' });
    });

    it('should call next() on reader', async () => {
      await engine.next();

      const nav = mockReader.getNavigation();
      expect(nav.next).toHaveBeenCalled();
    });

    it('should call prev() on reader', async () => {
      await engine.prev();

      const nav = mockReader.getNavigation();
      expect(nav.prev).toHaveBeenCalled();
    });

    it('should do nothing if no reader', async () => {
      engine.destroy();

      // Should not throw
      await engine.next();
      await engine.prev();
    });
  });

  describe('manifest navigation', () => {
    it('should go to next chapter when at last page', async () => {
      const mockReader = createMockReader();

      mockDetectFormat.mockReturnValue('epub');
      mockLoadReader.mockResolvedValue(mockReader);
      mockManifestNextChapter.mockResolvedValue(new ArrayBuffer(50));

      await engine.init(container, { manifest: '/chapters.json' });

      // Override getNavigation to return at-last-page state
      (mockReader.getNavigation as ReturnType<typeof vi.fn>).mockReturnValue({
        currentPage: 10,
        totalPages: 10,
        next: vi.fn(),
        prev: vi.fn(),
        goTo: vi.fn(),
      });

      await engine.next();

      // Should have tried to load next chapter
      expect(mockManifestNextChapter).toHaveBeenCalled();
    });

    it('should go to previous chapter when at first page', async () => {
      const mockReader = createMockReader();

      mockDetectFormat.mockReturnValue('epub');
      mockLoadReader.mockResolvedValue(mockReader);
      mockManifestPrevChapter.mockResolvedValue(new ArrayBuffer(50));

      await engine.init(container, { manifest: '/chapters.json' });

      // Override getNavigation to return at-first-page state
      (mockReader.getNavigation as ReturnType<typeof vi.fn>).mockReturnValue({
        currentPage: 1,
        totalPages: 10,
        next: vi.fn(),
        prev: vi.fn(),
        goTo: vi.fn().mockResolvedValue(undefined),
      });

      await engine.prev();

      // Should have tried to load prev chapter
      expect(mockManifestPrevChapter).toHaveBeenCalled();
    });
  });

  describe('getters', () => {
    beforeEach(async () => {
      const mockReader = createMockReader();
      mockLoadAndValidate.mockResolvedValue({ data: new ArrayBuffer(100), format: 'cbz' });
      mockLoadReader.mockResolvedValue(mockReader);

      await engine.init(container, { src: '/test.cbz' });
    });

    it('should return navigation from reader', () => {
      const nav = engine.getNavigation();
      expect(nav).not.toBeNull();
      expect(nav?.currentPage).toBe(1);
      expect(nav?.totalPages).toBe(10);
    });

    it('should return current format', () => {
      expect(engine.getFormat()).toBe('cbz');
    });

    it('should return false for hasManifest when not using manifest', () => {
      expect(engine.hasManifest()).toBe(false);
    });

    it('should return null for manifest controller when not using manifest', () => {
      expect(engine.getManifestController()).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should show error state for DRM protected files', async () => {
      const error: ReaderError = {
        type: 'DRM_PROTECTED',
        message: 'This file is protected',
        guidance: 'Try a different file',
        retryable: false,
      };
      mockLoadAndValidate.mockResolvedValue({ error });

      await engine.init(container, { src: '/protected.pdf' });

      expect(container.innerHTML).toContain('Protected Content');
      expect(container.innerHTML).toContain('This file is protected');
      expect(container.innerHTML).toContain('Try a different file');
    });

    it('should show retry button for retryable errors', async () => {
      const error: ReaderError = {
        type: 'NETWORK_ERROR',
        message: 'Connection failed',
        retryable: true,
      };
      mockLoadAndValidate.mockResolvedValue({ error });

      await engine.init(container, { src: '/test.pdf' });

      expect(container.innerHTML).toContain('Connection Error');
      expect(container.innerHTML).toContain('Try Again');
    });

    it('should handle unknown errors', async () => {
      mockLoadAndValidate.mockRejectedValue(new Error('Something went wrong'));

      const onError = vi.fn();
      await engine.init(container, { src: '/test.pdf', onError });

      expect(onError).toHaveBeenCalled();
      expect(onError.mock.calls[0][0].type).toBe('UNKNOWN');
    });
  });

  describe('updateProgress()', () => {
    it('should update loading progress display', async () => {
      const mockReader = createMockReader();
      mockLoadAndValidate.mockResolvedValue({ data: new ArrayBuffer(100), format: 'pdf' });
      mockLoadReader.mockResolvedValue(mockReader);

      await engine.init(container, { src: '/test.pdf' });

      engine.updateProgress(5 * 1024 * 1024, 10 * 1024 * 1024);

      expect(container.innerHTML).toContain('Loading...');
      expect(container.innerHTML).toContain('5.0MB');
      expect(container.innerHTML).toContain('10.0MB');
    });
  });

  describe('destroy()', () => {
    it('should clean up all resources', async () => {
      const mockReader = createMockReader();
      mockLoadAndValidate.mockResolvedValue({ data: new ArrayBuffer(100), format: 'pdf' });
      mockLoadReader.mockResolvedValue(mockReader);

      await engine.init(container, { src: '/test.pdf' });

      engine.destroy();

      expect(mockReader.destroy).toHaveBeenCalled();
      expect(engine.getNavigation()).toBeNull();
      expect(engine.getFormat()).toBeNull();
    });

    it('should destroy manifest controller if present', async () => {
      mockDetectFormat.mockReturnValue('epub');
      const mockReader = createMockReader();
      mockLoadReader.mockResolvedValue(mockReader);

      await engine.init(container, { manifest: '/chapters.json' });

      engine.destroy();

      expect(mockManifestDestroy).toHaveBeenCalled();
    });
  });
});
