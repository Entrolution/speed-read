/**
 * Keyboard navigation utilities
 * Provides consistent keyboard handling across readers
 */

export interface KeyboardNavigationOptions {
  /** Callback for next action (ArrowRight, ArrowDown) */
  onNext: () => void;
  /** Callback for previous action (ArrowLeft, ArrowUp) */
  onPrev: () => void;
  /** Optional check if navigation is currently allowed */
  canNavigate?: () => boolean;
  /** Whether to also handle Space key for next (default: false) */
  handleSpace?: boolean;
}

/**
 * Create a keyboard event handler for reader navigation
 * @returns The event handler function (for later removal)
 */
export function createKeyboardHandler(options: KeyboardNavigationOptions): (e: KeyboardEvent) => void {
  const { onNext, onPrev, canNavigate, handleSpace = false } = options;

  return (e: KeyboardEvent) => {
    // Ignore when focused on input elements
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    // Check if navigation is allowed
    if (canNavigate && !canNavigate()) {
      return;
    }

    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        onNext();
        break;
      case ' ':
        if (handleSpace) {
          e.preventDefault();
          onNext();
        }
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        onPrev();
        break;
    }
  };
}

/**
 * Set up keyboard navigation on the document
 * @returns Cleanup function to remove the listener
 */
export function setupKeyboardNavigation(options: KeyboardNavigationOptions): () => void {
  const handler = createKeyboardHandler(options);
  document.addEventListener('keydown', handler);

  return () => {
    document.removeEventListener('keydown', handler);
  };
}

/**
 * Make a container element focusable if it isn't already
 */
export function ensureFocusable(container: HTMLElement): void {
  if (!container.hasAttribute('tabindex')) {
    container.setAttribute('tabindex', '0');
  }
}
