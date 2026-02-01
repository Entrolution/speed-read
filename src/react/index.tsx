import React, { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import { ReaderEngine } from '@/core/engine';
import type { ReaderProps, ReaderError, ReaderNavigation } from '@/types';

export interface ReaderRef {
  next: () => Promise<void>;
  prev: () => Promise<void>;
  goTo: (page: number) => Promise<void>;
  getNavigation: () => ReaderNavigation | null;
  loadFile: (file: File | Blob) => Promise<void>;
}

export interface ReactReaderProps extends ReaderProps {
  className?: string;
  style?: React.CSSProperties;
}

/**
 * React Reader component
 *
 * @example
 * ```tsx
 * import { Reader } from 'speed-read/react';
 *
 * function App() {
 *   return (
 *     <Reader
 *       src="/book.epub"
 *       onPageChange={(page, total) => console.log(`Page ${page}/${total}`)}
 *     />
 *   );
 * }
 * ```
 */
export const Reader = forwardRef<ReaderRef, ReactReaderProps>(function Reader(
  { src, manifest, onError, onPageChange, onChapterChange, onReady, className, style },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ReaderEngine | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [currentChapter, setCurrentChapter] = useState(0);
  const [totalChapters, setTotalChapters] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ReaderError | null>(null);

  // Expose imperative methods
  useImperativeHandle(ref, () => ({
    next: async () => {
      await engineRef.current?.next();
    },
    prev: async () => {
      await engineRef.current?.prev();
    },
    goTo: async (page: number) => {
      const nav = engineRef.current?.getNavigation();
      if (nav) {
        await nav.goTo(page);
      }
    },
    getNavigation: () => {
      return engineRef.current?.getNavigation() ?? null;
    },
    loadFile: async (file: File | Blob) => {
      if (!containerRef.current) return;

      setIsLoading(true);
      setError(null);

      engineRef.current?.destroy();
      engineRef.current = new ReaderEngine();

      await engineRef.current.init(containerRef.current, {
        src: file,
        onError: handleError,
        onPageChange: handlePageChange,
        onChapterChange: handleChapterChange,
        onReady: handleReady,
      });
    },
  }));

  const handleError = useCallback(
    (err: ReaderError) => {
      setError(err);
      setIsLoading(false);
      onError?.(err);
    },
    [onError]
  );

  const handlePageChange = useCallback(
    (page: number, total: number) => {
      setCurrentPage(page);
      setTotalPages(total);
      onPageChange?.(page, total);
    },
    [onPageChange]
  );

  const handleChapterChange = useCallback(
    (chapter: number, total: number) => {
      setCurrentChapter(chapter);
      setTotalChapters(total);
      onChapterChange?.(chapter, total);
    },
    [onChapterChange]
  );

  const handleReady = useCallback(() => {
    setIsLoading(false);
    const nav = engineRef.current?.getNavigation();
    if (nav) {
      setCurrentPage(nav.currentPage);
      setTotalPages(nav.totalPages);
    }
    onReady?.();
  }, [onReady]);

  // Initialize engine on mount and when src/manifest changes
  useEffect(() => {
    if (!containerRef.current) return;
    if (!src && !manifest) return;

    setIsLoading(true);
    setError(null);

    // Clean up previous engine
    engineRef.current?.destroy();

    const engine = new ReaderEngine();
    engineRef.current = engine;

    engine.init(containerRef.current, {
      src,
      manifest,
      onError: handleError,
      onPageChange: handlePageChange,
      onChapterChange: handleChapterChange,
      onReady: handleReady,
    });

    return () => {
      engine.destroy();
    };
  }, [src, manifest, handleError, handlePageChange, handleChapterChange, handleReady]);

  const handlePrev = useCallback(async () => {
    await engineRef.current?.prev();
  }, []);

  const handleNext = useCallback(async () => {
    await engineRef.current?.next();
  }, []);

  return (
    <div
      className={`speed-reader-react ${className ?? ''}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        minHeight: '400px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        ...style,
      }}
    >
      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflow: 'hidden',
          position: 'relative',
        }}
      />

      {!isLoading && !error && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '1rem',
            padding: '0.5rem',
            borderTop: '1px solid #e0e0e0',
          }}
        >
          <button
            onClick={handlePrev}
            disabled={currentPage <= 1 && currentChapter <= 1}
            style={{
              padding: '0.5rem 1rem',
              border: '1px solid #0066cc',
              background: 'transparent',
              color: '#0066cc',
              borderRadius: '4px',
              cursor: currentPage <= 1 && currentChapter <= 1 ? 'not-allowed' : 'pointer',
              opacity: currentPage <= 1 && currentChapter <= 1 ? 0.5 : 1,
            }}
          >
            Previous
          </button>

          <span style={{ fontSize: '0.875rem', opacity: 0.7 }}>
            {totalChapters > 0 && `Ch ${currentChapter}/${totalChapters} · `}
            Page {currentPage} / {totalPages}
          </span>

          <button
            onClick={handleNext}
            disabled={currentPage >= totalPages && currentChapter >= totalChapters}
            style={{
              padding: '0.5rem 1rem',
              border: '1px solid #0066cc',
              background: 'transparent',
              color: '#0066cc',
              borderRadius: '4px',
              cursor:
                currentPage >= totalPages && currentChapter >= totalChapters
                  ? 'not-allowed'
                  : 'pointer',
              opacity:
                currentPage >= totalPages && currentChapter >= totalChapters ? 0.5 : 1,
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
});

export default Reader;

// Re-export types for convenience
export type { ReaderProps, ReaderError, ReaderNavigation } from '@/types';
