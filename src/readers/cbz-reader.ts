import { BaseReader } from './base-reader';

/**
 * Supported image extensions in CBZ files
 */
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];

/**
 * Check if a filename is an image
 */
function isImageFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Natural sort for filenames (handles numbered files correctly)
 */
function naturalSort(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * CBZ (Comic Book ZIP) reader
 * Uses the browser's native CompressionStream API when available,
 * falls back to a minimal ZIP parser for broader support
 */
export class CbzReader extends BaseReader {
  private images: { name: string; blob: Blob }[] = [];
  private currentImage: HTMLImageElement | null = null;
  private currentPageNum = 1;
  private onPageChangeCallback?: (page: number, total: number) => void;
  private objectUrls: string[] = [];

  async load(data: ArrayBuffer, container: HTMLElement): Promise<void> {
    // Parse the ZIP file and extract images
    this.images = await this.extractImages(data);

    if (this.images.length === 0) {
      throw new Error('No images found in CBZ file');
    }

    // Create image element
    this.currentImage = document.createElement('img');
    this.currentImage.className = 'speed-reader-cbz-image';
    this.currentImage.style.cssText = 'max-width: 100%; max-height: 100%; object-fit: contain;';

    // Clear container and add image
    container.innerHTML = '';
    container.appendChild(this.currentImage);

    this.container = container;
    this.isLoaded = true;

    // Render first page
    await this.renderPage(1);

    // Initialize controller
    this.initController(container, this.onPageChangeCallback);
  }

  /**
   * Set page change callback
   */
  setOnPageChange(callback: (page: number, total: number) => void): void {
    this.onPageChangeCallback = callback;
  }

  protected getPageCount(): number {
    return this.images.length;
  }

  protected async renderPage(pageNum: number): Promise<void> {
    if (!this.currentImage || this.images.length === 0) return;

    pageNum = Math.max(1, Math.min(pageNum, this.images.length));
    this.currentPageNum = pageNum;

    const image = this.images[pageNum - 1];
    const url = URL.createObjectURL(image.blob);
    this.objectUrls.push(url);

    // Wait for image to load
    await new Promise<void>((resolve, reject) => {
      this.currentImage!.onload = () => resolve();
      this.currentImage!.onerror = () => reject(new Error(`Failed to load image: ${image.name}`));
      this.currentImage!.src = url;
    });

    // Fire callback
    if (this.onPageChangeCallback) {
      this.onPageChangeCallback(pageNum, this.getPageCount());
    }
  }

  /**
   * Extract images from ZIP data
   * Uses a minimal ZIP parser implementation
   */
  private async extractImages(data: ArrayBuffer): Promise<{ name: string; blob: Blob }[]> {
    const view = new DataView(data);
    const bytes = new Uint8Array(data);
    const images: { name: string; blob: Blob }[] = [];

    let offset = 0;

    while (offset < data.byteLength - 4) {
      const signature = view.getUint32(offset, true);

      // Local file header signature
      if (signature !== 0x04034b50) break;

      const compressionMethod = view.getUint16(offset + 8, true);
      const compressedSize = view.getUint32(offset + 18, true);
      // uncompressedSize is read but not used - kept for documentation
      view.getUint32(offset + 22, true);
      const filenameLength = view.getUint16(offset + 26, true);
      const extraLength = view.getUint16(offset + 28, true);

      const filenameStart = offset + 30;
      const filename = new TextDecoder().decode(bytes.slice(filenameStart, filenameStart + filenameLength));

      const dataStart = filenameStart + filenameLength + extraLength;
      const fileData = bytes.slice(dataStart, dataStart + compressedSize);

      // Skip directories and non-image files
      if (filenameLength > 0 && !filename.endsWith('/') && isImageFile(filename)) {
        let blob: Blob;

        if (compressionMethod === 0) {
          // Stored (no compression)
          blob = new Blob([fileData]);
        } else if (compressionMethod === 8) {
          // Deflate compression - use DecompressionStream if available
          if (typeof DecompressionStream !== 'undefined') {
            const ds = new DecompressionStream('deflate-raw');
            const writer = ds.writable.getWriter();
            writer.write(fileData);
            writer.close();

            const decompressed = await new Response(ds.readable).arrayBuffer();
            blob = new Blob([decompressed]);
          } else {
            // Fallback: skip compressed files if DecompressionStream unavailable
            console.warn(`Skipping compressed image: ${filename}`);
            offset = dataStart + compressedSize;
            continue;
          }
        } else {
          // Unsupported compression method
          console.warn(`Unsupported compression method ${compressionMethod} for: ${filename}`);
          offset = dataStart + compressedSize;
          continue;
        }

        images.push({ name: filename, blob });
      }

      offset = dataStart + compressedSize;
    }

    // Sort images by filename (natural sort for proper page order)
    images.sort((a, b) => naturalSort(a.name, b.name));

    return images;
  }

  destroy(): void {
    // Clean up object URLs
    this.objectUrls.forEach((url) => URL.revokeObjectURL(url));
    this.objectUrls = [];
    this.images = [];
    this.currentImage = null;
    super.destroy();
  }
}
