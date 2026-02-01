import type { Manifest, ManifestChapter, ReaderError } from '@/types';

/**
 * Controller for handling chapter manifests in episodic content
 */
export class ManifestController {
  private manifest: Manifest | null = null;
  private currentChapterIndex = 0;
  private chapterData: Map<number, ArrayBuffer> = new Map();
  private onChapterChange?: (chapter: number, total: number) => void;
  private onError?: (error: ReaderError) => void;

  /**
   * Load manifest from URL
   */
  async load(url: string): Promise<Manifest> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load manifest: ${response.status} ${response.statusText}`);
      }
      this.manifest = await response.json() as Manifest;
      return this.manifest;
    } catch (err) {
      const error: ReaderError = {
        type: 'LOAD_FAILED',
        message: err instanceof Error ? err.message : 'Failed to load manifest',
        details: err,
      };
      if (this.onError) {
        this.onError(error);
      }
      throw error;
    }
  }

  /**
   * Set callbacks
   */
  setCallbacks(options: {
    onChapterChange?: (chapter: number, total: number) => void;
    onError?: (error: ReaderError) => void;
  }): void {
    this.onChapterChange = options.onChapterChange;
    this.onError = options.onError;
  }

  /**
   * Get manifest title
   */
  getTitle(): string {
    return this.manifest?.title ?? '';
  }

  /**
   * Get all chapters
   */
  getChapters(): ManifestChapter[] {
    return this.manifest?.chapters ?? [];
  }

  /**
   * Get total chapter count
   */
  getTotalChapters(): number {
    return this.manifest?.chapters.length ?? 0;
  }

  /**
   * Get current chapter index (0-based)
   */
  getCurrentChapterIndex(): number {
    return this.currentChapterIndex;
  }

  /**
   * Get current chapter (1-indexed for display)
   */
  getCurrentChapter(): number {
    return this.currentChapterIndex + 1;
  }

  /**
   * Get chapter info by index
   */
  getChapter(index: number): ManifestChapter | null {
    return this.manifest?.chapters[index] ?? null;
  }

  /**
   * Load chapter data by index
   */
  async loadChapter(index: number): Promise<ArrayBuffer> {
    // Check cache first
    if (this.chapterData.has(index)) {
      return this.chapterData.get(index)!;
    }

    const chapter = this.getChapter(index);
    if (!chapter) {
      throw new Error(`Chapter ${index} not found`);
    }

    try {
      const response = await fetch(chapter.src);
      if (!response.ok) {
        throw new Error(`Failed to load chapter: ${response.status}`);
      }
      const data = await response.arrayBuffer();

      // Cache the chapter data
      this.chapterData.set(index, data);

      return data;
    } catch (err) {
      const error: ReaderError = {
        type: 'LOAD_FAILED',
        message: `Failed to load chapter: ${chapter.title}`,
        details: err,
      };
      if (this.onError) {
        this.onError(error);
      }
      throw error;
    }
  }

  /**
   * Navigate to a specific chapter
   */
  async goToChapter(index: number): Promise<ArrayBuffer> {
    if (index < 0 || index >= this.getTotalChapters()) {
      throw new Error('Chapter index out of bounds');
    }

    this.currentChapterIndex = index;
    const data = await this.loadChapter(index);

    if (this.onChapterChange) {
      this.onChapterChange(this.getCurrentChapter(), this.getTotalChapters());
    }

    return data;
  }

  /**
   * Navigate to next chapter
   */
  async nextChapter(): Promise<ArrayBuffer | null> {
    if (this.currentChapterIndex >= this.getTotalChapters() - 1) {
      return null;
    }
    return this.goToChapter(this.currentChapterIndex + 1);
  }

  /**
   * Navigate to previous chapter
   */
  async prevChapter(): Promise<ArrayBuffer | null> {
    if (this.currentChapterIndex <= 0) {
      return null;
    }
    return this.goToChapter(this.currentChapterIndex - 1);
  }

  /**
   * Preload adjacent chapters for smoother navigation
   */
  async preloadAdjacent(): Promise<void> {
    const current = this.currentChapterIndex;
    const promises: Promise<ArrayBuffer>[] = [];

    // Preload next chapter
    if (current < this.getTotalChapters() - 1) {
      promises.push(this.loadChapter(current + 1));
    }

    // Preload previous chapter
    if (current > 0) {
      promises.push(this.loadChapter(current - 1));
    }

    // Wait for all to load (ignore errors)
    await Promise.allSettled(promises);
  }

  /**
   * Clear cached chapter data
   */
  clearCache(): void {
    this.chapterData.clear();
  }

  /**
   * Clean up
   */
  destroy(): void {
    this.clearCache();
    this.manifest = null;
    this.currentChapterIndex = 0;
  }
}
