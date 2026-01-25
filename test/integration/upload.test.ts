/**
 * Integration tests for upload flow.
 * Tests require a valid API key and make real network calls.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { EasyOneClient } from '../../src/index';
import { getTestConfig, shouldSkipIntegration } from '../setup.js';

// Initialize Web Crypto API for Node.js
if (typeof globalThis.crypto === 'undefined') {
  const { webcrypto } = await import('crypto');
  globalThis.crypto = webcrypto;
}

describe('integration: upload flow', { skip: shouldSkipIntegration() }, () => {
  let client: EasyOneClient;
  let testConfig: ReturnType<typeof getTestConfig>;

  before(() => {
    testConfig = getTestConfig();
    client = new EasyOneClient({
      apiKey: testConfig.testApiKey,
      baseUrl: testConfig.apiBaseUrl,
    });
  });

  it('should upload a small file (< chunk size)', async () => {
    const testContent = 'Hello, World! This is a small test file for integration testing.';
    const data = new TextEncoder().encode(testContent);
    const blob = new Blob([data], { type: 'text/plain' });

    const result = await client.uploadFile(blob, {
      fileName: 'test_small_file.txt',
      mimeType: 'text/plain',
      retentionDays: 7,
    });

    assert.ok(result.cid);
    assert.ok(result.decryptionKey);
    assert.strictEqual(typeof result.cid, 'string');
    assert.strictEqual(typeof result.decryptionKey, 'string');
  });

  it('should upload a large file (multiple chunks)', async () => {
    // Create a file larger than default chunk size (15MB)
    const CHUNK_SIZE = 15 * 1024 * 1024; // 15MB
    const size = CHUNK_SIZE + 5 * 1024 * 1024; // 15MB + 5MB
    const data = new Uint8Array(size).fill(65); // Fill with 'A'
    const blob = new Blob([data], { type: 'application/octet-stream' });

    const result = await client.uploadFile(blob, {
      fileName: 'test_large_file.bin',
      mimeType: 'application/octet-stream',
      retentionDays: 1, // Short retention for test files
    });

    assert.ok(result.cid);
    assert.ok(result.decryptionKey);
  });

  it('should upload file with custom metadata', async () => {
    const testContent = 'Custom metadata test content.';
    const data = new TextEncoder().encode(testContent);
    const blob = new Blob([data]);

    const result = await client.uploadFile(blob, {
      fileName: 'custom_metadata.dat',
      mimeType: 'application/octet-stream',
      retentionDays: 30,
      downloadLimit: 5,
    });

    assert.ok(result.cid);
    assert.ok(result.decryptionKey);
  });

  it('should upload file without options', async () => {
    const testContent = 'Test upload without options.';
    const data = new TextEncoder().encode(testContent);
    const blob = new Blob([data]);

    const result = await client.uploadFile(blob);

    assert.ok(result.cid);
    assert.ok(result.decryptionKey);
  });

  it('should generate unique encryption keys', async () => {
    const testContent1 = 'Content 1';
    const testContent2 = 'Content 2';

    const data1 = new TextEncoder().encode(testContent1);
    const data2 = new TextEncoder().encode(testContent2);

    const encrypted1 = await client.encryptData(data1);
    const encrypted2 = await client.encryptData(data2);

    // Keys should be different
    assert.notStrictEqual(encrypted1.key, encrypted2.key);
  });

  it('should upload binary data with all byte values', async () => {
    // Create binary data with all possible byte values
    const data = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      data[i] = i;
    }
    const blob = new Blob([data], { type: 'application/octet-stream' });

    const result = await client.uploadFile(blob, {
      fileName: 'binary_test.bin',
      mimeType: 'application/octet-stream',
      retentionDays: 1,
    });

    assert.ok(result.cid);
  });

  it('should encrypt and decrypt data separately', async () => {
    const testContent = 'Separate encryption test.';
    const data = new TextEncoder().encode(testContent);

    // Encrypt
    const encrypted = await client.encryptData(data);

    assert.ok(encrypted.encrypted instanceof ArrayBuffer);
    assert.strictEqual(typeof encrypted.key, 'string');

    // Decrypt
    const decrypted = await client.decryptData(encrypted.encrypted, encrypted.key);
    const decryptedText = new TextDecoder().decode(decrypted);

    assert.strictEqual(decryptedText, testContent);
  });

  it('should handle empty file', async () => {
    const data = new TextEncoder().encode('');
    const blob = new Blob([data]);

    const result = await client.uploadFile(blob, {
      fileName: 'empty.txt',
      mimeType: 'text/plain',
      retentionDays: 1,
    });

    assert.ok(result.cid);
  });

  it('should handle special characters in filename', async () => {
    const testContent = 'Special characters test.';
    const data = new TextEncoder().encode(testContent);
    const blob = new Blob([data]);

    const result = await client.uploadFile(blob, {
      fileName: 'test file (1) [copy].txt',
      mimeType: 'text/plain',
      retentionDays: 1,
    });

    assert.ok(result.cid);
  });

  it('should handle very long filename', async () => {
    const testContent = 'Long filename test.';
    const data = new TextEncoder().encode(testContent);
    const blob = new Blob([data]);

    const longFilename = 'a'.repeat(200) + '.txt';

    const result = await client.uploadFile(blob, {
      fileName: longFilename,
      mimeType: 'text/plain',
      retentionDays: 1,
    });

    assert.ok(result.cid);
  });
});
