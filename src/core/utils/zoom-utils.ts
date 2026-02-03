/**
 * Zoom utilities for visual readers
 * Provides consistent zoom handling across PDF, CBZ, and EPUB readers
 */

/** Minimum allowed zoom level */
export const MIN_ZOOM = 0.5;

/** Maximum allowed zoom level */
export const MAX_ZOOM = 3.0;

/** Default zoom level */
export const DEFAULT_ZOOM = 1.0;

/**
 * Clamp a zoom level to the allowed range
 */
export function clampZoom(level: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, level));
}

/**
 * Calculate zoom step for increment/decrement
 * Uses larger steps at higher zoom levels for better UX
 */
export function getZoomStep(currentZoom: number): number {
  if (currentZoom < 1.0) return 0.1;
  if (currentZoom < 2.0) return 0.25;
  return 0.5;
}

/**
 * Increment zoom level by one step
 */
export function zoomIn(currentZoom: number): number {
  const step = getZoomStep(currentZoom);
  return clampZoom(currentZoom + step);
}

/**
 * Decrement zoom level by one step
 */
export function zoomOut(currentZoom: number): number {
  const step = getZoomStep(currentZoom);
  return clampZoom(currentZoom - step);
}
