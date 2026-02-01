/**
 * Web Worker for ZIP extraction
 * Handles parsing and decompression off the main thread
 */

interface ZipEntry {
  index: number;
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  filenameLength: number;
}

interface ParseRequest {
  type: 'parse';
  data: ArrayBuffer;
}

interface ExtractRequest {
  type: 'extract';
  index: number;
}

type WorkerRequest = ParseRequest | ExtractRequest;

interface ParseResponse {
  type: 'parsed';
  entries: ZipEntry[];
}

interface ExtractResponse {
  type: 'extracted';
  index: number;
  data: ArrayBuffer;
  name: string;
}

interface ErrorResponse {
  type: 'error';
  message: string;
}

type WorkerResponse = ParseResponse | ExtractResponse | ErrorResponse;

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];

function isImageFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function naturalSort(a: ZipEntry, b: ZipEntry): number {
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
}

let zipData: ArrayBuffer | null = null;
let entries: ZipEntry[] = [];

/**
 * Parse ZIP Central Directory to get metadata without extracting
 */
function parseZip(data: ArrayBuffer): ZipEntry[] {
  const view = new DataView(data);
  const bytes = new Uint8Array(data);
  const imageEntries: ZipEntry[] = [];

  // Find End of Central Directory record
  let eocdOffset = -1;
  for (let i = data.byteLength - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error('Invalid ZIP: Could not find End of Central Directory');
  }

  const cdOffset = view.getUint32(eocdOffset + 16, true);
  const cdEntries = view.getUint16(eocdOffset + 10, true);

  // Parse Central Directory - metadata only
  let offset = cdOffset;
  let imageIndex = 0;

  for (let i = 0; i < cdEntries && offset < eocdOffset; i++) {
    const sig = view.getUint32(offset, true);
    if (sig !== 0x02014b50) break;

    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const filenameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);

    const filename = new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + filenameLength));

    offset += 46 + filenameLength + extraLength + commentLength;

    // Only track image files
    if (!filename.endsWith('/') && isImageFile(filename)) {
      imageEntries.push({
        index: imageIndex++,
        name: filename,
        compressionMethod,
        compressedSize,
        uncompressedSize,
        localHeaderOffset,
        filenameLength,
      });
    }
  }

  // Sort by filename for proper page order
  imageEntries.sort(naturalSort);

  // Re-index after sorting
  imageEntries.forEach((entry, i) => {
    entry.index = i;
  });

  return imageEntries;
}

/**
 * Extract a single image by index
 */
async function extractImage(index: number): Promise<{ data: ArrayBuffer; name: string }> {
  if (!zipData || index < 0 || index >= entries.length) {
    throw new Error(`Invalid extraction request: index ${index}`);
  }

  const entry = entries[index];
  const view = new DataView(zipData);
  const bytes = new Uint8Array(zipData);

  // Read local file header to get actual data location
  const localExtraLength = view.getUint16(entry.localHeaderOffset + 28, true);
  const dataStart = entry.localHeaderOffset + 30 + entry.filenameLength + localExtraLength;
  const fileData = bytes.slice(dataStart, dataStart + entry.compressedSize);

  let result: ArrayBuffer;

  if (entry.compressionMethod === 0) {
    // Stored (no compression)
    result = fileData.buffer.slice(fileData.byteOffset, fileData.byteOffset + fileData.byteLength);
  } else if (entry.compressionMethod === 8) {
    // Deflate compression
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('DecompressionStream not available');
    }

    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    writer.write(fileData);
    writer.close();

    const reader = ds.readable.getReader();
    const chunks: Uint8Array[] = [];
    let totalLength = 0;

    let readResult = await reader.read();
    while (!readResult.done) {
      chunks.push(readResult.value);
      totalLength += readResult.value.length;
      readResult = await reader.read();
    }

    // Combine chunks into single ArrayBuffer
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    result = combined.buffer;
  } else {
    throw new Error(`Unsupported compression method: ${entry.compressionMethod}`);
  }

  return { data: result, name: entry.name };
}

// Handle messages from main thread
self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const request = e.data;

  try {
    if (request.type === 'parse') {
      zipData = request.data;
      entries = parseZip(zipData);

      const response: ParseResponse = {
        type: 'parsed',
        entries: entries,
      };
      self.postMessage(response);
    } else if (request.type === 'extract') {
      const { data, name } = await extractImage(request.index);

      const response: ExtractResponse = {
        type: 'extracted',
        index: request.index,
        data,
        name,
      };
      // Transfer the ArrayBuffer to avoid copying
      self.postMessage(response, { transfer: [data] });
    }
  } catch (err) {
    const response: ErrorResponse = {
      type: 'error',
      message: err instanceof Error ? err.message : 'Unknown error',
    };
    self.postMessage(response);
  }
};

export type { ZipEntry, WorkerRequest, WorkerResponse, ParseResponse, ExtractResponse, ErrorResponse };
