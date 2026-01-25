/**
 * Integration tests for file operations (list, metadata).
 * Tests require a valid API key and make real network calls.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { EasyOneClient } from '../../src/index';
import { getTestConfig, shouldSkipIntegration } from '../setup.js';

// Initialize Web Crypto API for Node.js
if (typeof globalThis.crypto === 'undefined') {
  const { webcrypto } = await import('crypto');
  globalThis.crypto = webcrypto;
}

// Store uploaded file IDs for testing
const testFileIds: string[] = [];

describe('integration: file operations', { skip: shouldSkipIntegration() }, () => {
  let client: EasyOneClient;
  let testConfig: ReturnType<typeof getTestConfig>;

  before(async () => {
    testConfig = getTestConfig();
    client = new EasyOneClient({
      apiKey: testConfig.testApiKey,
      baseUrl: testConfig.apiBaseUrl,
    });

    // Upload 3 test files
    for (let i = 0; i < 3; i++) {
      const testContent = `Test file ${i} content.`;
      const data = new TextEncoder().encode(testContent);
      const blob = new Blob([data], { type: 'text/plain' });

      const result = await client.uploadFile(blob, {
        fileName: `test_file_${i}.txt`,
        mimeType: 'text/plain',
        retentionDays: 7,
      });

      testFileIds.push(result.cid);
    }
  });

  it('should list files with default parameters', async () => {
    const result = await client.listFiles();

    assert.ok(result.files);
    assert.ok(result.pagination);
    assert.ok(Array.isArray(result.files));
    assert.ok(result.files.length >= testFileIds.length);
  });

  it('should list files with a limit', async () => {
    const result = await client.listFiles({ limit: 2 });

    assert.ok(result.files);
    assert.ok(result.files.length <= 2);
    assert.strictEqual(result.pagination.limit, 2);
  });

  it('should list files with an offset', async () => {
    const result1 = await client.listFiles({ limit: 10, offset: 0 });
    const result2 = await client.listFiles({ limit: 10, offset: 2 });

    // Results should be different when using offset
    assert.notStrictEqual(result1.files[0]?.id, result2.files[0]?.id);
  });

  it('should have correct pagination information', async () => {
    const result = await client.listFiles({ limit: 5, offset: 0 });

    const pagination = result.pagination;
    assert.strictEqual(pagination.limit, 5);
    assert.strictEqual(pagination.offset, 0);
    assert.strictEqual(typeof pagination.total, 'number');
    assert.ok(pagination.total >= 0);
    assert.strictEqual(typeof pagination.hasMore, 'boolean');
  });

  it('should get metadata for a specific file', async () => {
    const fileId = testFileIds[0];
    const metadata = await client.getMetadata(fileId);

    assert.ok(metadata.id);
    assert.ok(metadata.filename);
    assert.strictEqual(typeof metadata.size, 'number');
    assert.ok(metadata.mimeType);
    assert.ok(metadata.uploadedAt);
    assert.strictEqual(metadata.id, fileId);
  });

  it('should have all required metadata fields', async () => {
    const fileId = testFileIds[0];
    const metadata = await client.getMetadata(fileId);

    // Required fields
    const requiredFields = ['id', 'filename', 'size', 'mimeType', 'uploadedAt'];
    for (const field of requiredFields) {
      assert.ok(field in metadata, `Missing required field: ${field}`);
    }
  });

  it('should reflect uploaded file information in metadata', async () => {
    const testContent = 'Metadata verification test content.';
    const data = new TextEncoder().encode(testContent);
    const blob = new Blob([data]);

    const uploadOptions = {
      fileName: 'metadata_test.txt',
      mimeType: 'text/plain',
      retentionDays: 14,
      downloadLimit: 100,
    };

    const result = await client.uploadFile(blob, uploadOptions);
    const metadata = await client.getMetadata(result.cid);

    assert.strictEqual(metadata.filename, uploadOptions.fileName);
    assert.strictEqual(metadata.mimeType, uploadOptions.mimeType);
    assert.strictEqual(metadata.size, testContent.length);
  });

  it('should return empty list with large offset', async () => {
    const result = await client.listFiles({ limit: 10, offset: 999999 });

    assert.ok(result.files);
    assert.strictEqual(result.files.length, 0);
    assert.strictEqual(result.pagination.hasMore, false);
  });

  it('should handle maximum limit (100)', async () => {
    const result = await client.listFiles({ limit: 100 });

    assert.ok(result.files.length <= 100);
    assert.strictEqual(result.pagination.limit, 100);
  });

  it('should return unique metadata for each file', async () => {
    const metadatas = await Promise.all(
      testFileIds.map(id => client.getMetadata(id))
    );

    const ids = metadatas.map(m => m.id);
    const uniqueIds = new Set(ids);

    assert.strictEqual(uniqueIds.size, ids.length);
  });

  it('should have correct file size in metadata', async () => {
    const testContent = 'X'.repeat(1000); // Exactly 1000 bytes
    const data = new TextEncoder().encode(testContent);
    const blob = new Blob([data]);

    const result = await client.uploadFile(blob);
    const metadata = await client.getMetadata(result.cid);

    assert.strictEqual(metadata.size, 1000);
  });

  it('should find uploaded files in list', async () => {
    // Upload a test file first to ensure it exists
    const testContent = 'File search test content.';
    const data = new TextEncoder().encode(testContent);
    const blob = new Blob([data]);

    const uploadResult = await client.uploadFile(blob, {
      fileName: 'search_test.txt',
      mimeType: 'text/plain',
      retentionDays: 7,
    });

    // Now verify it appears in the list
    const result = await client.listFiles({ limit: 100 });
    const fileIds = result.files.map(f => f.id);

    assert.ok(fileIds.includes(uploadResult.cid), `Test file ${uploadResult.cid} not found in list`);
  });

  it('should handle pagination correctly', async () => {
    const allFiles: string[] = [];
    let offset = 0;
    const limit = 50;

    while (true) {
      const result = await client.listFiles({ limit, offset });
      allFiles.push(...result.files.map(f => f.id));

      if (!result.pagination.hasMore) {
        break;
      }

      offset += limit;
    }

    // Verify we got files (at minimum our test files)
    assert.ok(allFiles.length >= testFileIds.length);
  });

  it('should handle download limit in metadata', async () => {
    const testContent = 'Download limit test content.';
    const data = new TextEncoder().encode(testContent);
    const blob = new Blob([data]);

    const downloadLimit = 50;
    const result = await client.uploadFile(blob, {
      fileName: 'download_limit_test.txt',
      mimeType: 'text/plain',
      retentionDays: 7,
      downloadLimit,
    });

    const metadata = await client.getMetadata(result.cid);

    // Download limit may or may not be present depending on server
    if ('downloadLimit' in metadata && metadata.downloadLimit !== null) {
      assert.strictEqual(metadata.downloadLimit, downloadLimit);
    }
  });

  it('should handle different MIME types', async () => {
    const testCases = [
      { content: 'Text content', type: 'text/plain' },
      { content: '<html></html>', type: 'text/html' },
      { content: '{}', type: 'application/json' },
    ];

    for (const testCase of testCases) {
      const data = new TextEncoder().encode(testCase.content);
      const blob = new Blob([data], { type: testCase.type });

      const result = await client.uploadFile(blob, {
        fileName: `mimetype_test.${testCase.type.split('/')[1]}`,
        mimeType: testCase.type,
        retentionDays: 1,
      });

      const metadata = await client.getMetadata(result.cid);
      assert.strictEqual(metadata.mimeType, testCase.type);
    }
  });

  it('should handle unicode filenames', async () => {
    const testContent = 'Unicode filename test.';
    const data = new TextEncoder().encode(testContent);
    const blob = new Blob([data]);

    const unicodeFilename = 'テストファイル.txt';
    const result = await client.uploadFile(blob, {
      fileName: unicodeFilename,
      mimeType: 'text/plain',
      retentionDays: 1,
    });

    const metadata = await client.getMetadata(result.cid);
    assert.ok(metadata.filename);
  });
});
