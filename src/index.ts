/**
 * EasyOne TypeScript SDK
 *
 * Official SDK for interacting with EasyOne API.
 * Provides client-side encryption and chunked upload functionality.
 */

export interface EasyOneConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface UploadResult {
  cid: string;
  decryptionKey: string;
}

export type UploadData =
  | Blob
  | Uint8Array
  | ReadableStream<Uint8Array>
  | AsyncIterable<Uint8Array>;

export interface UploadFile {
  data: UploadData;
  name: string;
  type: string;
  size: number;
}

export interface UploadOptions {
  retentionDays?: number;
  downloadLimit?: number;
  private?: boolean;
}

export interface FileMetadata {
  id: string;
  filename: string | null;
  size: number | null;
  storageSize?: number | null;
  mimeType: string | null;
  uploadedAt: string;
  expiresAt: string | null;
  downloadLimit: number | null;
  downloadCount: number;
  previewDisabled?: boolean;
  embeddingDisabled?: boolean;
  isPrivate?: boolean;
  encryptedMetadata?: string | null;
}

export interface FileListResult {
  files: FileMetadata[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
}

export interface DownloadInfo {
  cid: string;
  filename: string | null;
  size: number | null;
  storageSize?: number | null;
  mimeType: string | null;
  downloadUrl: string;
  expiresAt: string | null;
  downloadLimit: number | null;
  downloadCount: number;
  previewDisabled?: boolean;
  embeddingDisabled?: boolean;
  isPrivate?: boolean;
  encryptedMetadata?: string | null;
}

export interface DownloadFileResult extends PlainFileMetadata {
  stream: ReadableStream<Uint8Array>;
}

export interface PlainFileMetadata {
  filename: string;
  mimeType: string;
  size: number;
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

/**
 * Encryption utilities for client-side AES-GCM encryption
 */
class Encryption {
  private readonly ALGORITHM = 'AES-GCM';
  private readonly KEY_LENGTH = 256;
  private readonly IV_LENGTH = 12;

  /**
   * Generate a new encryption key
   */
  async generateKey(): Promise<CryptoKey> {
    return await crypto.subtle.generateKey(
      {
        name: this.ALGORITHM,
        length: this.KEY_LENGTH,
      },
      true,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Export encryption key to base64 string
   */
  async exportKey(key: CryptoKey): Promise<string> {
    const exported = await crypto.subtle.exportKey('raw', key);
    return btoa(String.fromCharCode(...new Uint8Array(exported)));
  }

  /**
   * Import encryption key from base64 string
   */
  async importKey(base64Key: string): Promise<CryptoKey> {
    const rawKey = Uint8Array.from(atob(base64Key), c => c.charCodeAt(0));
    return await crypto.subtle.importKey(
      'raw',
      rawKey,
      this.ALGORITHM,
      true,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypt a chunk of data
   */
  async encryptChunk(chunk: ArrayBuffer, key: CryptoKey): Promise<ArrayBuffer> {
    const iv = crypto.getRandomValues(new Uint8Array(this.IV_LENGTH));
    const encrypted = await crypto.subtle.encrypt(
      {
        name: this.ALGORITHM,
        iv: iv,
      },
      key,
      chunk
    );

    // Combine IV and encrypted data
    const result = new Uint8Array(iv.byteLength + encrypted.byteLength);
    result.set(iv, 0);
    result.set(new Uint8Array(encrypted), iv.byteLength);
    return result.buffer;
  }

  /**
   * Decrypt a chunk of data
   */
  async decryptChunk(chunk: ArrayBuffer, key: CryptoKey): Promise<ArrayBuffer> {
    const chunkArray = new Uint8Array(chunk);
    const iv = chunkArray.slice(0, this.IV_LENGTH);
    const data = chunkArray.slice(this.IV_LENGTH);

    return await crypto.subtle.decrypt(
      {
        name: this.ALGORITHM,
        iv: iv,
      },
      key,
      data
    );
  }

  async encryptMetadata(metadata: PlainFileMetadata, key: CryptoKey): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(this.IV_LENGTH));
    const encoded = new TextEncoder().encode(JSON.stringify(metadata));
    const encrypted = await crypto.subtle.encrypt(
      { name: this.ALGORITHM, iv },
      key,
      encoded
    );

    const result = new Uint8Array(iv.byteLength + encrypted.byteLength);
    result.set(iv, 0);
    result.set(new Uint8Array(encrypted), iv.byteLength);
    return btoa(String.fromCharCode(...result));
  }

  async decryptMetadata(encryptedMetadata: string, keyString: string): Promise<PlainFileMetadata> {
    const key = await this.importKey(keyString);
    const raw = Uint8Array.from(atob(encryptedMetadata), c => c.charCodeAt(0));
    const iv = raw.slice(0, this.IV_LENGTH);
    const data = raw.slice(this.IV_LENGTH);
    const decrypted = await crypto.subtle.decrypt(
      { name: this.ALGORITHM, iv },
      key,
      data
    );
    return JSON.parse(new TextDecoder().decode(decrypted));
  }

}

class StreamByteReader {
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>;
  private readonly maxInputChunkSize: number;
  private chunks: Uint8Array[] = [];
  private chunkOffset = 0;
  private bufferedBytes = 0;
  private ended = false;

  constructor(stream: ReadableStream<Uint8Array>, maxInputChunkSize: number) {
    this.reader = stream.getReader();
    this.maxInputChunkSize = maxInputChunkSize;
  }

  async readExactly(length: number): Promise<Uint8Array> {
    while (this.bufferedBytes < length && !this.ended) {
      const { done, value } = await this.reader.read();
      if (done) {
        this.ended = true;
        break;
      }
      if (!(value instanceof Uint8Array)) {
        throw new TypeError('Input stream must produce Uint8Array chunks');
      }
      if (value.byteLength === 0) {
        throw new TypeError('Input stream must not produce empty chunks');
      }
      if (value.byteLength > this.maxInputChunkSize) {
        throw new RangeError(`Input stream chunk exceeds ${this.maxInputChunkSize} bytes`);
      }
      this.chunks.push(value);
      this.bufferedBytes += value.byteLength;
    }

    if (this.bufferedBytes < length) {
      throw new Error(`Input stream ended early: expected ${length} bytes, received ${this.bufferedBytes}`);
    }

    const result = new Uint8Array(length);
    let written = 0;
    while (written < length) {
      const chunk = this.chunks[0];
      const available = chunk.byteLength - this.chunkOffset;
      const count = Math.min(available, length - written);
      result.set(chunk.subarray(this.chunkOffset, this.chunkOffset + count), written);
      written += count;
      this.chunkOffset += count;
      this.bufferedBytes -= count;
      if (this.chunkOffset === chunk.byteLength) {
        this.chunks.shift();
        this.chunkOffset = 0;
      }
    }
    return result;
  }

  async ensureEnd(): Promise<void> {
    if (this.bufferedBytes > 0) {
      throw new Error('Input stream contains trailing data');
    }
    while (!this.ended) {
      const { done, value } = await this.reader.read();
      if (done) {
        this.ended = true;
        return;
      }
      if (value && value.byteLength > 0) {
        throw new Error('Input stream contains trailing data');
      }
    }
  }

  async cancel(reason?: unknown): Promise<void> {
    await this.reader.cancel(reason);
  }
}

/**
 * Main UploaderPro Client
 */
export class EasyOneClient {
  private config: {
    apiKey: string;
    baseUrl: string;
    chunkSize: number;
  };
  private encryption: Encryption;

  private readonly CHUNK_SIZE = 15 * 1024 * 1024; // Fixed at 15MB for CDN compatibility
  private readonly MAX_FILE_SIZE = 100 * 1024 * 1024 * 1024; // 100GB

  constructor(config: EasyOneConfig) {
    if (!globalThis.crypto?.subtle || typeof globalThis.fetch !== 'function' || typeof globalThis.ReadableStream !== 'function') {
      throw new Error('EasyOneClient requires Web Crypto, fetch, and ReadableStream support');
    }

    // Validate API key
    if (!config.apiKey || !config.apiKey.trim()) {
      throw new Error('API key cannot be empty');
    }

    const apiKey = config.apiKey.trim();

    // Validate API key format
    if (!apiKey.startsWith('up_live_')) {
      throw new Error(
        'Invalid API key format. API keys must start with \'up_live_\''
      );
    }

    this.config = {
      apiKey: apiKey,
      baseUrl: config.baseUrl || 'https://file.ez1.cc',
      chunkSize: this.CHUNK_SIZE, // Fixed at 15MB
    };
    this.encryption = new Encryption();
  }

  /**
   * Upload a file with client-side encryption
   */
  async uploadFile(
    file: UploadFile,
    options: UploadOptions = {}
  ): Promise<UploadResult> {
    const {
      retentionDays = 30,
      downloadLimit = null,
    } = options;
    const isPrivate = options.private === true;
    const { name: fileName, type: mimeType, size: fileSize } = file;

    if (!fileName || !mimeType || !Number.isSafeInteger(fileSize) || fileSize < 0) {
      throw new TypeError('UploadFile requires a name, type, and non-negative safe-integer size');
    }

    // Client-side validation: Check file extension
    const forbiddenExtensions = ['.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js'];
    const fileExt = fileName.includes('.') ? '.' + fileName.split('.').pop()?.toLowerCase() : '';
    if (forbiddenExtensions.includes(fileExt)) {
      throw new Error(
        `Forbidden file type: ${fileExt}. Executable files are not allowed for security reasons.`
      );
    }

    // Client-side validation: Check file size
    if (fileSize > this.MAX_FILE_SIZE) {
      throw new Error(
        `File too large: ${fileSize} bytes. Maximum size is ${this.MAX_FILE_SIZE} bytes`
      );
    }

    const encryptionKey = await this.encryption.generateKey();
    const decryptionKey = await this.encryption.exportKey(encryptionKey);
    const encryptedMetadata = await this.encryption.encryptMetadata(
      { filename: fileName, mimeType, size: fileSize },
      encryptionKey
    );
    const reader = new StreamByteReader(
      this.toReadableStream(file.data),
      this.CHUNK_SIZE
    );

    // Calculate chunks (ensure at least 1 chunk even for empty files)
    const totalChunks = Math.max(1, Math.ceil(fileSize / this.config.chunkSize));

    // SECURITY: CID is now server-generated on first chunk
    // Do not generate client-side CID
    let cid: string | undefined = undefined;

    // Upload chunks
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const remaining = fileSize - chunkIndex * this.config.chunkSize;
      const chunk = await reader.readExactly(Math.min(this.config.chunkSize, Math.max(remaining, 0)));
      if (chunkIndex === totalChunks - 1) {
        await reader.ensureEnd();
      }

      // Encrypt chunk
      const encryptedChunk = await this.encryption.encryptChunk(
        copyToArrayBuffer(chunk),
        encryptionKey
      );

      // Upload chunk (server returns CID on first chunk)
      cid = await this.uploadChunk(cid, chunkIndex, totalChunks, encryptedChunk, {
        fileName,
        fileSize,
        mimeType,
        retentionDays,
        downloadLimit,
        isPrivate,
        encryptedMetadata,
      });
    }
    if (!cid) {
      throw new Error('Upload completed without a server-generated CID');
    }
    return { cid, decryptionKey };
  }

  private toReadableStream(data: UploadData): ReadableStream<Uint8Array> {
    if (data instanceof Blob) {
      return data.stream();
    }
    if (data instanceof Uint8Array) {
      let offset = 0;
      return new ReadableStream({
        pull: controller => {
          if (offset >= data.byteLength) {
            controller.close();
            return;
          }
          const end = Math.min(offset + this.CHUNK_SIZE, data.byteLength);
          controller.enqueue(data.subarray(offset, end));
          offset = end;
        },
      });
    }
    if (data instanceof ReadableStream) {
      return data;
    }
    if (data && typeof data[Symbol.asyncIterator] === 'function') {
      const iterator = data[Symbol.asyncIterator]();
      return new ReadableStream({
        async pull(controller) {
          const { done, value } = await iterator.next();
          if (done) {
            controller.close();
            return;
          }
          if (!(value instanceof Uint8Array)) {
            controller.error(new TypeError('Upload iterable must produce Uint8Array chunks'));
            return;
          }
          controller.enqueue(value);
        },
        async cancel(reason) {
          await iterator.return?.(reason);
        },
      });
    }
    throw new TypeError('UploadFile data must be a Blob, Uint8Array, ReadableStream, or AsyncIterable');
  }

  /**
   * Build encrypted metadata for low-level multipart flows.
   */
  async buildEncryptedMetadata(
    metadata: PlainFileMetadata,
    decryptionKey: string
  ): Promise<string> {
    if (!metadata.filename || !metadata.mimeType || !Number.isFinite(metadata.size)) {
      throw new Error('metadata requires filename, mimeType, and size');
    }

    const key = await this.encryption.importKey(decryptionKey);
    return this.encryption.encryptMetadata(metadata, key);
  }

  /**
   * Decrypt encrypted metadata returned by metadata/list/download APIs.
   */
  async decryptMetadata(
    encryptedMetadata: string,
    decryptionKey: string
  ): Promise<PlainFileMetadata> {
    return this.encryption.decryptMetadata(encryptedMetadata, decryptionKey);
  }

  /**
   * Upload a single encrypted chunk with retry logic for rate limiting.
   *
   * Returns the CID from server response
   *
   * Note:
   *   For chunk 0, do not send x-cid header (server generates CID).
   *   For chunks > 0, send the CID returned by the server.
   */
  private async uploadChunk(
    cid: string | undefined,
    chunkIndex: number,
    totalChunks: number,
    encryptedData: ArrayBuffer,
    metadata: {
      fileName: string;
      fileSize: number;
      mimeType: string;
      retentionDays: number;
      downloadLimit: number | null;
      isPrivate: boolean;
      encryptedMetadata: string;
    },
    maxRetries: number = 5
  ): Promise<string> {
    if (!metadata.encryptedMetadata) {
      throw new TypeError('encryptedMetadata is required');
    }
    const url = `${this.config.baseUrl}/api/public/v1/upload`;

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'x-chunk-index': chunkIndex.toString(),
      'x-total-chunks': totalChunks.toString(),
      'x-file-name': encodeURIComponent('encrypted-metadata'),
      'x-file-size': metadata.fileSize.toString(),
      'x-mime-type': 'application/octet-stream',
      'x-retention-days': metadata.retentionDays.toString(),
    };

    // SECURITY: Only send x-cid header for subsequent chunks
    // First chunk: server generates CID
    // Subsequent chunks: use CID returned by server
    if (chunkIndex > 0) {
      if (!cid) {
        throw new Error(`CID required for chunk ${chunkIndex} but not provided`);
      }
      headers['x-cid'] = cid;
    }

    if (metadata.downloadLimit !== null) {
      headers['x-download-limit'] = metadata.downloadLimit.toString();
    }
    headers['x-encrypted-metadata'] = metadata.encryptedMetadata;
    if (metadata.isPrivate) {
      headers['x-private'] = 'true';
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: new Uint8Array(encryptedData),
      });

      if (response.ok) {
        // Extract CID from response
        const result = await response.json();
        if (!result.cid) {
          throw new Error(`Server did not return CID: ${JSON.stringify(result)}`);
        }
        return result.cid;
      }

      if (response.status === 429) {
        // Rate limited - get Retry-After header
        const retryAfter = response.headers.get('Retry-After');
        const waitSeconds = retryAfter ? parseInt(retryAfter, 10) : Math.pow(2, attempt);

        lastError = new Error(`Rate limited. Retry after ${waitSeconds} seconds. (Attempt ${attempt + 1}/${maxRetries + 1})`);

        if (attempt < maxRetries) {
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
          continue;
        }
      }

      // Non-429 error or max retries exceeded
      const error = await response.text();
      throw new Error(`Upload failed: ${error}`);
    }

    throw lastError || new Error('Upload failed after retries');
  }

  /**
   * Complete a multipart upload (alternative approach)
   */
  async completeUpload(
    cid: string,
    metadata: {
      fileName: string;
      fileSize: number;
      mimeType: string;
      retentionDays?: number;
      downloadLimit?: number;
      private?: boolean;
      encryptedMetadata: string;
    }
  ): Promise<{ cid: string; success: boolean }> {
    if (!metadata.encryptedMetadata) {
      throw new TypeError('encryptedMetadata is required');
    }
    const url = `${this.config.baseUrl}/api/public/v1/complete-upload`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cid,
        ...metadata,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Complete upload failed: ${error}`);
    }

    return response.json();
  }

  /** Download and decrypt a file without buffering the full payload. */
  async downloadFile(
    cid: string,
    decryptionKey: string
  ): Promise<DownloadFileResult> {
    const downloadInfo = await this.getDownloadInfo(cid);
    if (!downloadInfo.encryptedMetadata) {
      throw new Error('Download is missing encrypted metadata');
    }
    const fileInfo = await this.encryption.decryptMetadata(
      downloadInfo.encryptedMetadata,
      decryptionKey
    );
    if (
      !fileInfo ||
      typeof fileInfo.filename !== 'string' ||
      !fileInfo.filename ||
      typeof fileInfo.mimeType !== 'string' ||
      !fileInfo.mimeType ||
      !Number.isSafeInteger(fileInfo.size) ||
      fileInfo.size < 0 ||
      fileInfo.size > this.MAX_FILE_SIZE
    ) {
      throw new Error('Download metadata does not contain a valid filename, MIME type, and size');
    }

    const response = await fetch(downloadInfo.downloadUrl);
    if (!response.ok) {
      throw new Error(`Download failed: ${response.statusText}`);
    }
    if (!response.body) {
      throw new Error('Download response does not contain a readable body');
    }

    const key = await this.encryption.importKey(decryptionKey);
    const encryptedReader = new StreamByteReader(
      response.body,
      this.CHUNK_SIZE + 28
    );
    const totalChunks = Math.max(1, Math.ceil(fileInfo.size / this.CHUNK_SIZE));
    let chunkIndex = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull: async controller => {
        try {
          if (chunkIndex >= totalChunks) {
            await encryptedReader.ensureEnd();
            controller.close();
            return;
          }

          const remaining = fileInfo.size - chunkIndex * this.CHUNK_SIZE;
          const plaintextLength = Math.min(this.CHUNK_SIZE, Math.max(remaining, 0));
          const encryptedChunk = await encryptedReader.readExactly(plaintextLength + 28);
          const decrypted = await this.encryption.decryptChunk(
            copyToArrayBuffer(encryptedChunk),
            key
          );
          if (decrypted.byteLength !== plaintextLength) {
            throw new Error(`Decrypted chunk ${chunkIndex} has an invalid size`);
          }

          chunkIndex += 1;
          if (decrypted.byteLength > 0) {
            controller.enqueue(new Uint8Array(decrypted));
          }
          if (chunkIndex >= totalChunks) {
            await encryptedReader.ensureEnd();
            controller.close();
          }
        } catch (error) {
          controller.error(error);
          await encryptedReader.cancel(error).catch(() => undefined);
        }
      },
      cancel: reason => encryptedReader.cancel(reason),
    });

    return { ...fileInfo, stream };
  }

  /**
   * Get download information for a file
   */
  async getDownloadInfo(cid: string): Promise<DownloadInfo> {
    const url = `${this.config.baseUrl}/api/public/v1/files/${cid}/download`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Get download info failed: ${error}`);
    }

    return response.json();
  }

  /**
   * Get file metadata
   */
  async getMetadata(cid: string): Promise<FileMetadata> {
    const url = `${this.config.baseUrl}/api/public/v1/files/${cid}/metadata`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Get metadata failed: ${error}`);
    }

    return response.json();
  }

  /**
   * List user's files
   */
  async listFiles(options: { limit?: number; offset?: number } = {}): Promise<FileListResult> {
    const { limit = 50, offset = 0 } = options;

    const url = new URL(`${this.config.baseUrl}/api/public/v1/files`);
    url.searchParams.set('limit', limit.toString());
    url.searchParams.set('offset', offset.toString());

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`List files failed: ${error}`);
    }

    return response.json();
  }

  /**
   * Encrypt data without uploading
   */
  async encryptData(data: ArrayBuffer): Promise<{ encrypted: ArrayBuffer; key: string }> {
    const key = await this.encryption.generateKey();
    const keyString = await this.encryption.exportKey(key);
    const encrypted = await this.encryption.encryptChunk(data, key);

    return {
      encrypted,
      key: keyString,
    };
  }

  /**
   * Decrypt data
   */
  async decryptData(encryptedData: ArrayBuffer, key: string): Promise<ArrayBuffer> {
    const importedKey = await this.encryption.importKey(key);
    return this.encryption.decryptChunk(encryptedData, importedKey);
  }
}

// Export for Node.js environment
export default EasyOneClient;
