/**
 * Unit tests for error handling scenarios.
 */

import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { EasyOneClient } from '../../src/index';

// Initialize Web Crypto API for Node.js
if (typeof globalThis.crypto === 'undefined') {
  const { webcrypto } = await import('crypto');
  globalThis.crypto = webcrypto;
}

describe('unit: error handling', () => {
  it('should handle upload failure with non-OK response', async (t) => {
    const client = new EasyOneClient({
      apiKey: 'up_live_test',
      baseUrl: 'https://test.example.com',
    });

    t.mock.method(globalThis, 'fetch', async () => ({
      ok: false,
      status: 500,
      text: async () => 'Upload failed: insufficient storage',
    } as Response));

    await assert.rejects(
      async () => {
        await client['uploadChunk'](
          'test-cid',
          0,
          1,
          new ArrayBuffer(100),
          {
            fileName: 'test.txt',
            fileSize: 100,
            mimeType: 'text/plain',
            retentionDays: 30,
            downloadLimit: null,
            isPrivate: false,
            encryptedMetadata: 'AAAAAAAAAAAAAAAABBBBBBBBBBBBBBBBBBBBBBBBBBBB',
          }
        );
      },
      /Upload failed/
    );
  });

  it('should handle complete upload failure', async (t) => {
    const client = new EasyOneClient({
      apiKey: 'up_live_test',
      baseUrl: 'https://test.example.com',
    });

    t.mock.method(globalThis, 'fetch', async () => ({
      ok: false,
      status: 400,
      text: async () => 'Invalid CID',
    } as Response));

    await assert.rejects(
      async () => {
        await client.completeUpload('invalid-cid', {
          fileName: 'test.txt',
          fileSize: 100,
          mimeType: 'text/plain',
          encryptedMetadata: 'AAAAAAAAAAAAAAAABBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        });
      },
      /Complete upload failed/
    );
  });

  it('should handle get metadata failure', async (t) => {
    const client = new EasyOneClient({
      apiKey: 'up_live_test',
      baseUrl: 'https://test.example.com',
    });

    t.mock.method(globalThis, 'fetch', async () => ({
      ok: false,
      status: 404,
      text: async () => 'File not found',
    } as Response));

    await assert.rejects(
      async () => {
        await client.getMetadata('nonexistent-cid');
      },
      /Get metadata failed/
    );
  });

  it('should handle list files failure', async (t) => {
    const client = new EasyOneClient({
      apiKey: 'up_live_test',
      baseUrl: 'https://test.example.com',
    });

    t.mock.method(globalThis, 'fetch', async () => ({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    } as Response));

    await assert.rejects(
      async () => {
        await client.listFiles();
      },
      /List files failed/
    );
  });

  it('should handle get download info failure', async (t) => {
    const client = new EasyOneClient({
      apiKey: 'up_live_test',
      baseUrl: 'https://test.example.com',
    });

    t.mock.method(globalThis, 'fetch', async () => ({
      ok: false,
      status: 410,
      text: async () => 'File expired',
    } as Response));

    await assert.rejects(
      async () => {
        await client.getDownloadInfo('expired-cid');
      },
      /Get download info failed/
    );
  });

  it('should handle download file failure', async (t) => {
    const client = new EasyOneClient({
      apiKey: 'up_live_test',
      baseUrl: 'https://test.example.com',
    });

    let callCount = 0;
    t.mock.method(globalThis, 'fetch', async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            downloadUrl: 'https://example.com/download/test-cid',
            filename: 'test.txt',
            mimeType: 'text/plain',
          }),
        } as Response;
      } else {
        return {
          ok: false,
          status: 404,
          statusText: 'Not Found',
        } as Response;
      }
    });

    await assert.rejects(
      async () => {
        await client.downloadFile('test-cid', 'decryption_key');
      },
      /Download failed/
    );
  });

  it('should handle invalid base64 decryption key', async () => {
    const client = new EasyOneClient({
      apiKey: 'up_live_test',
      baseUrl: 'https://test.example.com',
    });

    const encryptedData = new ArrayBuffer(100);
    const invalidKey = 'not_valid_base64!!!';

    await assert.rejects(
      async () => {
        await client.decryptData(encryptedData, invalidKey);
      }
    );
  });

  it('should handle truncated encrypted data', async () => {
    const client = new EasyOneClient({
      apiKey: 'up_live_test',
      baseUrl: 'https://test.example.com',
    });

    const truncatedData = new Uint8Array([1, 2, 3, 4, 5]).buffer;

    await assert.rejects(
      async () => {
        await client.decryptData(truncatedData, btoa('valid_key'));
      }
    );
  });

  it('should handle network timeout', async (t) => {
    const client = new EasyOneClient({
      apiKey: 'up_live_test',
      baseUrl: 'https://test.example.com',
    });

    t.mock.method(globalThis, 'fetch', async () => ({
      ok: false,
      status: 408,
      text: async () => 'Request timeout',
    } as Response));

    await assert.rejects(
      async () => {
        await client.getMetadata('test-cid');
      },
      /Get metadata failed/
    );
  });

  it('should handle empty error response', async (t) => {
    const client = new EasyOneClient({
      apiKey: 'up_live_test',
      baseUrl: 'https://test.example.com',
    });

    t.mock.method(globalThis, 'fetch', async () => ({
      ok: false,
      status: 500,
      text: async () => '',
    } as Response));

    await assert.rejects(
      async () => {
        await client.getMetadata('test-cid');
      }
    );
  });

  it('should handle malformed JSON response', async (t) => {
    const client = new EasyOneClient({
      apiKey: 'up_live_test',
      baseUrl: 'https://test.example.com',
    });

    t.mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('Invalid JSON');
      },
    } as Response));

    await assert.rejects(
      async () => {
        await client.getMetadata('test-cid');
      }
    );
  });

  it('should handle empty API key', async (t) => {
    // Empty API key should raise an error during client initialization
    assert.throws(
      () => {
        new EasyOneClient({
          apiKey: '',
        });
      },
      /API key cannot be empty/
    );
  });

  it('should handle invalid API key format', async (t) => {
    // Invalid API key format should raise an error during client initialization
    assert.throws(
      () => {
        new EasyOneClient({
          apiKey: 'invalid_key_format',
        });
      },
      /Invalid API key format/
    );
  });

  it('should handle special characters in filename', async (t) => {
    const client = new EasyOneClient({
      apiKey: 'up_live_test',
      baseUrl: 'https://test.example.com',
    });

    const mockFetch = t.mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      status: 200,
      json: async () => ({ cid: 'server-generated-cid', success: true }),
    } as Response));

    const specialFilename = 'test file (1) [copy].txt';

    // This should succeed - special characters are handled via encodeURIComponent
    await client['uploadChunk'](
      'test-cid',
      0,
      1,
      new ArrayBuffer(100),
      {
        fileName: specialFilename,
        fileSize: 100,
        mimeType: 'text/plain',
        retentionDays: 30,
        downloadLimit: null,
        isPrivate: false,
        encryptedMetadata: 'AAAAAAAAAAAAAAAABBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      }
    );

    // Verify the call was made
    assert.strictEqual(mockFetch.mock.calls.length, 1);
  });

  it('should handle fetch exception', async (t) => {
    const client = new EasyOneClient({
      apiKey: 'up_live_test',
      baseUrl: 'https://test.example.com',
    });

    t.mock.method(globalThis, 'fetch', async () => {
      throw new Error('Network error');
    });

    await assert.rejects(
      async () => {
        await client.getMetadata('test-cid');
      },
      /Network error/
    );
  });
});
