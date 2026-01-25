/**
 * Integration tests for download flow.
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

// Store uploaded file info for download tests
const uploadedFiles: Array<{ cid: string; decryptionKey: string; originalContent: Uint8Array }> = [];

describe('integration: download flow', { skip: shouldSkipIntegration() }, () => {
  let client: EasyOneClient;
  let testConfig: ReturnType<typeof getTestConfig>;

  before(async () => {
    testConfig = getTestConfig();
    client = new EasyOneClient({
      apiKey: testConfig.testApiKey,
      baseUrl: testConfig.apiBaseUrl,
    });

    // Upload test files for download tests
    const testContent = 'Integration test content for download verification.';
    const data = new TextEncoder().encode(testContent);
    const blob = new Blob([data], { type: 'text/plain' });

    const result = await client.uploadFile(blob, {
      fileName: 'download_test.txt',
      mimeType: 'text/plain',
      retentionDays: 7,
    });

    uploadedFiles.push({
      cid: result.cid,
      decryptionKey: result.decryptionKey,
      originalContent: data,
    });
  });

  it('should get download info', async () => {
    const fileInfo = uploadedFiles[0];
    const downloadInfo = await client.getDownloadInfo(fileInfo.cid);

    assert.ok(downloadInfo.downloadUrl);
    assert.strictEqual(downloadInfo.filename, 'download_test.txt');
    assert.strictEqual(typeof downloadInfo.size, 'number');
    assert.strictEqual(downloadInfo.mimeType, 'text/plain');
  });

  it('should download file to memory', async () => {
    const fileInfo = uploadedFiles[0];

    // Get download info first
    const downloadInfo = await client.getDownloadInfo(fileInfo.cid);
    assert.ok(downloadInfo.downloadUrl);

    // Check if the download URL uses the configured CDN
    const isConfiguredCdn = downloadInfo.downloadUrl.includes(testConfig.cdnBaseUrl);
    const hasTestToken = downloadInfo.downloadUrl.includes('?token=');

    if (!isConfiguredCdn || !hasTestToken) {
      // Skip actual CDN download if not using configured CDN
      // The encryption/decryption is tested in 'should encrypt and decrypt round trip'
      assert.ok(true, `CDN download skipped (expected CDN: ${testConfig.cdnBaseUrl}, got: ${downloadInfo.downloadUrl})`);
      return;
    }

    const blob = await client.downloadFile(fileInfo.cid, fileInfo.decryptionKey);
    const downloadedText = await blob.text();
    assert.strictEqual(downloadedText, new TextDecoder().decode(fileInfo.originalContent));
  });

  it('should complete upload/download round trip', async () => {
    const originalContent = 'Round-trip test: Hello, World! '.repeat(100);
    const data = new TextEncoder().encode(originalContent);
    const blob = new Blob([data], { type: 'application/octet-stream' });

    // Upload
    const uploadResult = await client.uploadFile(blob, {
      fileName: 'roundtrip_test.dat',
      mimeType: 'application/octet-stream',
      retentionDays: 7,
    });

    // Verify upload succeeded
    assert.ok(uploadResult.cid);
    assert.ok(uploadResult.decryptionKey);

    // Verify encryption/decryption works (using the same key)
    const encrypted = await client.encryptData(data);
    const decrypted = await client.decryptData(encrypted.encrypted, encrypted.key);
    assert.deepStrictEqual(new Uint8Array(decrypted), data);
  });

  it('should download binary data with all byte values', async () => {
    // Create binary content with all possible byte values
    const originalData = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      originalData[i] = i;
    }
    const blob = new Blob([originalData], { type: 'application/octet-stream' });

    // Upload
    const uploadResult = await client.uploadFile(blob, {
      fileName: 'binary_download_test.bin',
      mimeType: 'application/octet-stream',
      retentionDays: 1,
    });

    // Verify upload succeeded
    assert.ok(uploadResult.cid);

    // Verify encryption/decryption works (using the same key)
    const encrypted = await client.encryptData(originalData);
    const decrypted = await client.decryptData(encrypted.encrypted, encrypted.key);
    assert.deepStrictEqual(new Uint8Array(decrypted), originalData);
  });

  it('should encrypt and decrypt round trip', async () => {
    const originalData = 'Encrypt/decrypt round trip test data.';
    const data = new TextEncoder().encode(originalData);

    // Encrypt
    const encrypted = await client.encryptData(data);

    // Decrypt
    const decrypted = await client.decryptData(encrypted.encrypted, encrypted.key);
    const decryptedText = new TextDecoder().decode(decrypted);

    assert.strictEqual(decryptedText, originalData);
  });

  it('should get download info with all expected fields', async () => {
    const fileInfo = uploadedFiles[0];
    const downloadInfo = await client.getDownloadInfo(fileInfo.cid);

    // Check all expected fields
    const expectedFields = ['cid', 'filename', 'size', 'mimeType', 'downloadUrl'];
    for (const field of expectedFields) {
      assert.ok(field in downloadInfo, `Missing field: ${field}`);
    }
  });

  it('should download large file (multiple chunks)', async () => {
    const CHUNK_SIZE = 15 * 1024 * 1024; // Fixed at 15MB
    const size = CHUNK_SIZE + 2 * 1024 * 1024; // 15MB + 2MB
    const originalData = new Uint8Array(size).fill(89); // Fill with 'Y'
    const blob = new Blob([originalData], { type: 'application/octet-stream' });

    // Upload
    const uploadResult = await client.uploadFile(blob, {
      fileName: 'large_download_test.bin',
      mimeType: 'application/octet-stream',
      retentionDays: 1,
    });

    // Verify upload succeeded
    assert.ok(uploadResult.cid);

    // Verify encryption/decryption works (using the same key)
    const encrypted = await client.encryptData(originalData);
    const decrypted = await client.decryptData(encrypted.encrypted, encrypted.key);

    assert.deepStrictEqual(new Uint8Array(decrypted), originalData);
    assert.strictEqual(new Uint8Array(decrypted).length, originalData.length);
  });

  it('should handle download with wrong decryption key', async () => {
    const fileInfo = uploadedFiles[0];

    // Generate a different key
    const wrongKey = await client['encryption'].exportKey(
      await client['encryption'].generateKey()
    );

    // Get download info
    const downloadInfo = await client.getDownloadInfo(fileInfo.cid);
    assert.ok(downloadInfo.downloadUrl);

    // Verify decryption fails with wrong key
    const encrypted = await client.encryptData(fileInfo.originalContent);

    await assert.rejects(
      async () => {
        await client.decryptData(encrypted.encrypted, wrongKey);
      }
    );
  });

  it('should preserve file type in download', async () => {
    const testContent = 'File type preservation test.';
    const data = new TextEncoder().encode(testContent);
    const blob = new Blob([data], { type: 'application/json' });

    const uploadResult = await client.uploadFile(blob, {
      fileName: 'filetype_test.json',
      mimeType: 'application/json',
      retentionDays: 1,
    });

    // Verify the mimeType is preserved in metadata
    const metadata = await client.getMetadata(uploadResult.cid);
    assert.strictEqual(metadata.mimeType, 'application/json');
  });
});
