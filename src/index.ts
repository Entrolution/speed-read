// Web Component
export { SpeedReader } from './components/speed-reader';

// Core exports for advanced usage
export { ReaderEngine } from './core/engine';
export { ManifestController } from './core/manifest-controller';
export { PageController } from './core/controller';

// Validation utilities
export {
  detectFormat,
  isValidFormat,
  checkDRM,
  validateFile,
  loadAndValidate,
} from './core/validation';

// Format readers (for direct usage)
export { loadReader } from './readers';
export type { FormatReader } from './types';

// Types
export type {
  DocumentFormat,
  ReaderProps,
  ReaderError,
  ReaderErrorType,
  ReaderSource,
  ReaderNavigation,
  Manifest,
  ManifestChapter,
  ValidationResult,
} from './types';
