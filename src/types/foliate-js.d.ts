declare module 'foliate-js/view.js' {
  export class ResponseError extends Error {}
  export class NotFoundError extends Error {}
  export class UnsupportedTypeError extends Error {}

  export interface Book {
    sections: Section[];
    metadata?: {
      title?: string;
      creator?: string;
      language?: string;
    };
    toc?: TocItem[];
    dir?: 'ltr' | 'rtl';
    rendition?: {
      layout?: string;
    };
    resolveHref?: (href: string) => { index: number; anchor: (doc: Document) => Element | Range };
    resolveCFI?: (cfi: string) => { index: number; anchor: (doc: Document) => Element | Range };
  }

  export interface Section {
    id?: string;
    linear?: string;
    load?: () => Promise<void>;
    createDocument?: () => Promise<Document>;
    cfi?: string;
  }

  export interface TocItem {
    href: string;
    label: string;
    subitems?: TocItem[];
  }

  export interface RelocateDetail {
    index: number;
    fraction: number;
    size: number;
    section?: { current: number; total: number };
    tocItem?: TocItem;
    pageItem?: { label: string };
    cfi: string;
    range?: Range;
  }

  export function makeBook(file: Blob | string): Promise<Book>;

  export class View extends HTMLElement {
    book?: Book;
    lastLocation?: RelocateDetail;
    history: {
      canGoBack: boolean;
      canGoForward: boolean;
      back: () => void;
      forward: () => void;
    };

    open(book: Blob | string | Book): Promise<void>;
    close(): void;
    init(options?: { lastLocation?: string; showTextStart?: boolean }): Promise<void>;

    goTo(target: number | string | { fraction: number }): Promise<{ index: number; anchor?: (doc: Document) => Element | Range } | undefined>;
    goToFraction(fraction: number): Promise<void>;
    goToTextStart(): Promise<void>;

    prev(distance?: number): Promise<void>;
    next(distance?: number): Promise<void>;
    goLeft(): Promise<void>;
    goRight(): Promise<void>;
  }
}
