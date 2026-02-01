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
   * Extract images from ZIP data using Central Directory
   * This is more robust than parsing local file headers
   */
  private async extractImages(data: ArrayBuffer): Promise<{ name: string; blob: Blob }[]> {
    const view = new DataView(data);
    const bytes = new Uint8Array(data);
    const images: { name: string; blob: Blob }[] = [];

    // Find End of Central Directory record (search from end)
    let eocdOffset = -1;
    for (let i = data.byteLength - 22; i >= 0; i--) {
      if (view.getUint32(i, true) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }

    if (eocdOffset === -1) {
      console.error('Could not find End of Central Directory record');
      return [];
    }

    const cdOffset = view.getUint32(eocdOffset + 16, true);
    const cdEntries = view.getUint16(eocdOffset + 10, true);

    // Parse Central Directory
    let offset = cdOffset;
    for (let i = 0; i < cdEntries && offset < eocdOffset; i++) {
      const sig = view.getUint32(offset, true);
      if (sig !== 0x02014b50) break; // Central directory file header signature

      const compressionMethod = view.getUint16(offset + 10, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const filenameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const localHeaderOffset = view.getUint32(offset + 42, true);

      const filename = new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + filenameLength));

      // Move to next central directory entry
      offset += 46 + filenameLength + extraLength + commentLength;

      // Skip directories and non-image files
      if (!filename.endsWith('/') && isImageFile(filename)) {
        // Read from local file header to get actual data location
        const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
        const dataStart = localHeaderOffset + 30 + filenameLength + localExtraLength;
        const fileData = bytes.slice(dataStart, dataStart + compressedSize);

        let blob: Blob;

        if (compressionMethod === 0) {
          // Stored (no compression)
          blob = new Blob([fileData]);
        } else if (compressionMethod === 8) {
          // Deflate compression
          if (typeof DecompressionStream !== 'undefined') {
            try {
              const ds = new DecompressionStream('deflate-raw');
              const writer = ds.writable.getWriter();
              writer.write(fileData);
              writer.close();

              const reader = ds.readable.getReader();
              const chunks: ArrayBuffer[] = [];
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
              }
              blob = new Blob(chunks);
            } catch (err) {
              console.warn(`Failed to decompress: ${filename}`, err);
              continue;
            }
          } else {
            console.warn(`DecompressionStream unavailable, skipping: ${filename}`);
            continue;
          }
        } else {
          console.warn(`Unsupported compression method ${compressionMethod}: ${filename}`);
          continue;
        }

        images.push({ name: filename, blob });
      }
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
