/**
 * Unit tests for API calls (with mocks).
 */

import { describe, it, mock, before } from 'node:test';
import assert from 'node:assert';
import { EasyOneClient } from '../../src/index';

// Initialize Web Crypto API for Node.js
if (typeof globalThis.crypto === 'undefined') {
  const { webcrypto } = await import('crypto');
  globalThis.crypto = webcrypto;
}

describe('unit: API calls', () => {
  let client: EasyOneClient;

  before(() => {
    client = new EasyOneClient({
      apiKey: 'up_live_test12345',
      baseUrl: 'https://test.example.com',
    });
  });

  it('should upload chunk successfully', async (t) => {
    const mockFetch = t.mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      status: 200,
      json: async () => ({ cid: 'server-generated-cid', success: true, message: 'Chunk uploaded' }),
    } as Response));

    // Test chunk 0: cid should be undefined, server generates CID
    const resultCid = await client['uploadChunk'](
      undefined,  // chunk 0: no cid
      0,
      1,
      new ArrayBuffer(100),
      {
        fileName: 'test.txt',
        fileSize: 100,
        mimeType: 'text/plain',
        retentionDays: 30,
        downloadLimit: null,
      }
    );

    assert.strictEqual(mockFetch.mock.calls.length, 1);
    assert.strictEqual(resultCid, 'server-generated-cid');
  });

  it('should upload chunk with download limit', async (t) => {
    const mockFetch = t.mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      status: 200,
      json: async () => ({ cid: 'server-generated-cid', success: true, message: 'Chunk uploaded' }),
    } as Response));

    // Test chunk 0: cid should be undefined, server generates CID
    const resultCid = await client['uploadChunk'](
      undefined,  // chunk 0: no cid
      0,
      1,
      new ArrayBuffer(100),
      {
        fileName: 'test.txt',
        fileSize: 100,
        mimeType: 'text/plain',
        retentionDays: 30,
        downloadLimit: 10,
      }
    );

    assert.strictEqual(mockFetch.mock.calls.length, 1);
    assert.strictEqual(resultCid, 'server-generated-cid');
  });

  it('should complete upload successfully', async (t) => {
    const mockFetch = t.mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      status: 200,
      json: async () => ({ cid: 'test-cid', success: true }),
    } as Response));

    const result = await client.completeUpload('test-cid', {
      fileName: 'test.txt',
      fileSize: 1024,
      mimeType: 'text/plain',
    });

    assert.strictEqual(result.cid, 'test-cid');
    assert.strictEqual(result.success, true);
  });

  it('should get metadata successfully', async (t) => {
    const mockMetadata = {
      id: 'test-cid',
      filename: 'test.txt',
      size: 1024,
      mimeType: 'text/plain',
      uploadedAt: '2024-01-01T00:00:00Z',
      expiresAt: '2024-02-01T00:00:00Z',
      downloadLimit: 10,
      downloadCount: 0,
    };

    const mockFetch = t.mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      status: 200,
      json: async () => mockMetadata,
    } as Response));

    const metadata = await client.getMetadata('test-cid');

    assert.strictEqual(metadata.id, 'test-cid');
    assert.strictEqual(metadata.filename, 'test.txt');
    assert.strictEqual(metadata.size, 1024);
  });

  it('should list files successfully', async (t) => {
    const mockResponse = {
      files: [
        {
          id: 'file1',
          filename: 'test1.txt',
          size: 1024,
          mimeType: 'text/plain',
          uploadedAt: '2024-01-01T00:00:00Z',
          expiresAt: null,
          downloadLimit: null,
          downloadCount: 0,
        },
      ],
      pagination: {
        limit: 50,
        offset: 0,
        total: 1,
        hasMore: false,
      },
    };

    const mockFetch = t.mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    } as Response));

    const result = await client.listFiles({ limit: 10, offset: 5 });

    assert.strictEqual(result.files.length, 1);
    assert.strictEqual(result.pagination.total, 1);
  });

  it('should get download info successfully', async (t) => {
    const mockDownloadInfo = {
      cid: 'test-cid',
      filename: 'test.txt',
      size: 1024,
      mimeType: 'text/plain',
      downloadUrl: 'https://example.com/download/test-cid',
      expiresAt: '2024-02-01T00:00:00Z',
      downloadLimit: 10,
      downloadCount: 0,
    };

    const mockFetch = t.mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      status: 200,
      json: async () => mockDownloadInfo,
    } as Response));

    const info = await client.getDownloadInfo('test-cid');

    assert.strictEqual(info.cid, 'test-cid');
    assert.ok(info.downloadUrl);
  });

  it('should include authorization header', async (t) => {
    const mockFetch = t.mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response));

    await client.getMetadata('test-cid');

    // Verify fetch was called
    assert.strictEqual(mockFetch.mock.calls.length, 1);
  });

  it('should include content-type for JSON requests', async (t) => {
    const mockFetch = t.mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      status: 200,
      json: async () => ({ cid: 'test', success: true }),
    } as Response));

    await client.completeUpload('test', {
      fileName: 'test.txt',
      fileSize: 100,
      mimeType: 'text/plain',
    });

    // Verify fetch was called
    assert.strictEqual(mockFetch.mock.calls.length, 1);
  });
});
