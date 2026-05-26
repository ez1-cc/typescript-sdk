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

export interface UploadOptions {
  fileName?: string;
  mimeType?: string;
  retentionDays?: number;
  downloadLimit?: number;
  private?: boolean;
  isPrivate?: boolean;
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

export interface DownloadResult {
  cid: string;
  filename: string | null;
  size: number | null;
  storageSize?: number | null;
  mimeType: string | null;
  downloadUrl: string;
  expiresAt: string | null;
  downloadLimit: number | null;
  downloadCount: number;
  isPrivate?: boolean;
  encryptedMetadata?: string | null;
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

  async encryptMetadata(metadata: { filename: string; mimeType: string; size: number }, key: CryptoKey): Promise<string> {
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

  async decryptMetadata(encryptedMetadata: string, keyString: string): Promise<{ filename: string; mimeType: string; size: number }> {
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

  /**
   * Decrypt multi-chunk data
   * Each chunk is encrypted separately with: [IV][encrypted data][tag]
   */
  async decryptMultiChunk(encryptedData: ArrayBuffer, keyString: string): Promise<ArrayBuffer> {
    const key = await this.importKey(keyString);
    const dataView = new Uint8Array(encryptedData);

    // Encryption overhead: IV (12 bytes) + tag (16 bytes) = 28 bytes
    const CHUNK_SIZE = 15 * 1024 * 1024; // 15MB
    const ENCRYPTION_OVERHEAD = 12 + 16; // IV + tag
    const ENCRYPTED_CHUNK_SIZE = CHUNK_SIZE + ENCRYPTION_OVERHEAD;

    // If data is smaller than one encrypted chunk, decrypt as single chunk
    if (dataView.byteLength <= ENCRYPTED_CHUNK_SIZE) {
      return this.decryptChunk(encryptedData, key);
    }

    // Multi-chunk file: decrypt each chunk separately
    const decryptedChunks: ArrayBuffer[] = [];
    let offset = 0;

    while (offset < dataView.byteLength) {
      const remainingBytes = dataView.byteLength - offset;
      const currentEncryptedSize = Math.min(ENCRYPTED_CHUNK_SIZE, remainingBytes);

      const encryptedChunk = dataView.slice(offset, offset + currentEncryptedSize).buffer;
      const decryptedChunk = await this.decryptChunk(encryptedChunk, key);
      decryptedChunks.push(decryptedChunk);

      offset += currentEncryptedSize;
    }

    // Combine all decrypted chunks
    const totalDecryptedSize = decryptedChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const combinedResult = new Uint8Array(totalDecryptedSize);
    let writeOffset = 0;
    for (const chunk of decryptedChunks) {
      combinedResult.set(new Uint8Array(chunk), writeOffset);
      writeOffset += chunk.byteLength;
    }

    return combinedResult.buffer;
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
    file: File | Buffer | Blob,
    options: UploadOptions = {}
  ): Promise<UploadResult> {
    const {
      fileName = file instanceof File ? file.name : 'unnamed',
      mimeType = file instanceof File ? file.type : (file instanceof Blob ? file.type : 'application/octet-stream'),
      retentionDays = 30,
      downloadLimit = null,
    } = options;
    const isPrivate = options.private === true || options.isPrivate === true;

    // Client-side validation: Check file extension
    const forbiddenExtensions = ['.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js'];
    const fileExt = fileName.includes('.') ? '.' + fileName.split('.').pop()?.toLowerCase() : '';
    if (forbiddenExtensions.includes(fileExt)) {
      throw new Error(
        `Forbidden file type: ${fileExt}. Executable files are not allowed for security reasons.`
      );
    }

    // Generate encryption key
    const encryptionKey = await this.encryption.generateKey();
    const decryptionKey = await this.encryption.exportKey(encryptionKey);

    // Read file data
    let fileData: ArrayBuffer;
    if (file instanceof File) {
      fileData = await file.arrayBuffer();
    } else if (file instanceof Blob) {
      fileData = await file.arrayBuffer();
    } else {
      fileData = file.buffer.slice(
        file.byteOffset,
        file.byteOffset + file.byteLength
      ) as ArrayBuffer;
    }

    const fileSize = fileData.byteLength;
    const encryptedMetadata = isPrivate
      ? await this.encryption.encryptMetadata({ filename: fileName, mimeType, size: fileSize }, encryptionKey)
      : null;

    // Client-side validation: Check file size
    if (fileSize > this.MAX_FILE_SIZE) {
      throw new Error(
        `File too large: ${fileSize} bytes. Maximum size is ${this.MAX_FILE_SIZE} bytes`
      );
    }

    // Calculate chunks (ensure at least 1 chunk even for empty files)
    const totalChunks = Math.max(1, Math.ceil(fileSize / this.config.chunkSize));

    // SECURITY: CID is now server-generated on first chunk
    // Do not generate client-side CID
    let cid: string | undefined = undefined;

    // Upload chunks
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const start = chunkIndex * this.config.chunkSize;
      const end = Math.min(start + this.config.chunkSize, fileSize);
      const chunk = fileData.slice(start, end);

      // Encrypt chunk
      const encryptedChunk = await this.encryption.encryptChunk(chunk, encryptionKey);

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

    return {
      cid: cid!, // cid will be set after first chunk
      decryptionKey,
    };
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
      encryptedMetadata: string | null;
    },
    maxRetries: number = 5
  ): Promise<string> {
    const url = `${this.config.baseUrl}/api/public/v1/upload`;

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'x-chunk-index': chunkIndex.toString(),
      'x-total-chunks': totalChunks.toString(),
      'x-file-name': encodeURIComponent(metadata.isPrivate ? 'private-file' : metadata.fileName),
      'x-file-size': metadata.isPrivate ? '0' : metadata.fileSize.toString(),
      'x-mime-type': metadata.isPrivate ? 'application/octet-stream' : metadata.mimeType,
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
    if (metadata.isPrivate) {
      headers['x-private'] = 'true';
      if (metadata.encryptedMetadata) {
        headers['x-encrypted-metadata'] = metadata.encryptedMetadata;
      }
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
      isPrivate?: boolean;
      encryptedMetadata?: string;
    }
  ): Promise<{ cid: string; success: boolean }> {
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

  /**
   * Download and decrypt a file
   */
  async downloadFile(
    cid: string,
    decryptionKey: string,
    outputPath?: string
  ): Promise<Blob> {
    // Get download URL
    const downloadInfo = await this.getDownloadInfo(cid);
    let fileInfo = {
      filename: downloadInfo.filename || 'downloaded_file',
      mimeType: downloadInfo.mimeType || 'application/octet-stream',
      size: downloadInfo.size,
    };

    if (downloadInfo.isPrivate && downloadInfo.encryptedMetadata) {
      fileInfo = await this.encryption.decryptMetadata(downloadInfo.encryptedMetadata, decryptionKey);
    }

    // Download file
    const response = await fetch(downloadInfo.downloadUrl);
    if (!response.ok) {
      throw new Error(`Download failed: ${response.statusText}`);
    }

    const encryptedData = await response.arrayBuffer();

    // Decrypt data (handles both single and multi-chunk files)
    const decryptedData = await this.encryption.decryptMultiChunk(encryptedData, decryptionKey);

    const blob = new Blob([decryptedData], { type: fileInfo.mimeType });

    // Save to file if outputPath provided (Node.js environment)
    if (outputPath && typeof require !== 'undefined') {
      const fs = require('fs');
      fs.writeFileSync(outputPath, Buffer.from(decryptedData));
    }

    return blob;
  }

  /**
   * Get download information for a file
   */
  async getDownloadInfo(cid: string): Promise<DownloadResult> {
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
    return this.encryption.decryptMultiChunk(encryptedData, key);
  }
}

// Export for Node.js environment
export default EasyOneClient;

// Node.js compatibility layer
if (typeof require !== 'undefined' && typeof window === 'undefined') {
  const { webcrypto } = require('crypto');
  // @ts-ignore - polyfill Web Crypto API
  global.crypto = webcrypto;
}
