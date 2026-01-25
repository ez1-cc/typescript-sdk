/**
 * Test data generators and fixtures for TypeScript SDK tests.
 */

/**
 * Generate sample file data for testing.
 */
export function generateSampleFileData(size: number = 1024): Uint8Array {
  const data = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    data[i] = (i % 256);
  }
  return data;
}

/**
 * Generate sample text content.
 */
export function generateSampleText(): string {
  return 'Hello, World! This is a test file content.'.repeat(100);
}

/**
 * Create a mock file-like object (Blob).
 */
export function createMockFile(content: string | Uint8Array, filename: string = 'test.txt'): Blob {
  if (typeof content === 'string') {
    return new Blob([content], { type: 'text/plain' });
  }
  return new Blob([content], { type: 'application/octet-stream' });
}

/**
 * Generate random CID (content ID).
 */
export function generateCid(): string {
  return crypto.randomUUID();
}

/**
 * Generate mock file metadata.
 */
export interface MockFileMetadata {
  id: string;
  filename: string;
  size: number;
  mimeType: string;
  uploadedAt: string;
  expiresAt: string | null;
  downloadLimit: number | null;
  downloadCount: number;
}

export function createMockFileMetadata(overrides: Partial<MockFileMetadata> = {}): MockFileMetadata {
  return {
    id: overrides.id || crypto.randomUUID(),
    filename: overrides.filename || 'test.txt',
    size: overrides.size || 1024,
    mimeType: overrides.mimeType || 'text/plain',
    uploadedAt: overrides.uploadedAt || new Date().toISOString(),
    expiresAt: overrides.expiresAt !== undefined ? overrides.expiresAt : null,
    downloadLimit: overrides.downloadLimit !== undefined ? overrides.downloadLimit : null,
    downloadCount: overrides.downloadCount || 0,
  };
}

/**
 * Generate mock file list result.
 */
export interface MockFileListResult {
  files: MockFileMetadata[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
}

export function createMockFileListResult(count: number = 2): MockFileListResult {
  const files: MockFileMetadata[] = [];
  for (let i = 0; i < count; i++) {
    files.push(createMockFileMetadata({
      id: `file-${i}`,
      filename: `test${i}.txt`,
      size: 1024 * (i + 1),
    }));
  }

  return {
    files,
    pagination: {
      limit: 50,
      offset: 0,
      total: count,
      hasMore: false,
    },
  };
}

/**
 * Generate mock download result.
 */
export interface MockDownloadResult {
  cid: string;
  filename: string;
  size: number;
  mimeType: string;
  downloadUrl: string;
  expiresAt: string | null;
  downloadLimit: number | null;
  downloadCount: number;
}

export function createMockDownloadResult(overrides: Partial<MockDownloadResult> = {}): MockDownloadResult {
  const cid = overrides.cid || crypto.randomUUID();
  return {
    cid,
    filename: overrides.filename || 'test.txt',
    size: overrides.size || 1024,
    mimeType: overrides.mimeType || 'text/plain',
    downloadUrl: overrides.downloadUrl || `https://example.com/download/${cid}`,
    expiresAt: overrides.expiresAt !== undefined ? overrides.expiresAt : null,
    downloadLimit: overrides.downloadLimit !== undefined ? overrides.downloadLimit : null,
    downloadCount: overrides.downloadCount || 0,
  };
}

/**
 * Generate mock upload result.
 */
export interface MockUploadResult {
  cid: string;
  decryptionKey: string;
}

export function createMockUploadResult(): MockUploadResult {
  return {
    cid: crypto.randomUUID(),
    decryptionKey: btoa('mock_encryption_key_32_bytes_long'),
  };
}

/**
 * Sleep/delay utility for tests.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a mock Response object for fetch mocking.
 */
export function createMockResponse(
  data: unknown,
  options: { ok?: boolean; status?: number; statusText?: string } = {}
): Response {
  const { ok = true, status = 200, statusText = 'OK' } = options;

  return {
    ok,
    status,
    statusText,
    json: async () => data as Record<string, unknown>,
    text: async () => JSON.stringify(data),
    arrayBuffer: async () => {
      if (data instanceof ArrayBuffer) {
        return data;
      }
      if (data instanceof Uint8Array) {
        return data.buffer;
      }
      const encoder = new TextEncoder();
      return encoder.encode(JSON.stringify(data)).buffer;
    },
    blob: async () => new Blob([JSON.stringify(data)]),
    headers: new Headers(),
  } as Response;
}
