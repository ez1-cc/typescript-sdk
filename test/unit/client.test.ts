/**
 * Unit tests for client initialization.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { EasyOneClient } from '../../src/index';

// Initialize Web Crypto API for Node.js
if (typeof globalThis.crypto === 'undefined') {
  const { webcrypto } = await import('crypto');
  globalThis.crypto = webcrypto;
}

describe('unit: client initialization', () => {
  it('should initialize with default values', () => {
    const client = new EasyOneClient({
      apiKey: 'up_live_test_key',
    });

    assert.strictEqual(client['config'].apiKey, 'up_live_test_key');
    assert.strictEqual(client['config'].baseUrl, 'https://file.ez1.cc');
    assert.strictEqual(client['config'].chunkSize, 15 * 1024 * 1024); // Fixed at 15MB
  });

  it('should initialize with custom base URL', () => {
    const customUrl = 'https://custom.example.com';
    const client = new EasyOneClient({
      apiKey: 'up_live_test_key',
      baseUrl: customUrl,
    });

    assert.strictEqual(client['config'].baseUrl, customUrl);
    assert.strictEqual(client['config'].chunkSize, 15 * 1024 * 1024); // Still 15MB
  });

  it('should store API key as-is', () => {
    const specialKey = 'up_live_e458375d_1ea6b2ed70c45b029e63ba4f1327197bb24cd62b29ca190b8a460bf5e386e716';
    const client = new EasyOneClient({
      apiKey: specialKey,
    });

    assert.strictEqual(client['config'].apiKey, specialKey);
  });

  it('should handle base URL without trailing slash', () => {
    const url = 'https://example.com/api';
    const client = new EasyOneClient({
      apiKey: 'up_live_test_key',
      baseUrl: url,
    });

    assert.strictEqual(client['config'].baseUrl, url);
  });

  it('should handle base URL with trailing slash', () => {
    const url = 'https://example.com/api/';
    const client = new EasyOneClient({
      apiKey: 'up_live_test_key',
      baseUrl: url,
    });

    assert.strictEqual(client['config'].baseUrl, url);
  });

  it('should create encryption instance', () => {
    const client = new EasyOneClient({
      apiKey: 'up_live_test_key',
    });

    assert.ok(client['encryption']);
  });

  it('should always use 15MB chunk size regardless of config', () => {
    // Chunk size is now fixed at 15MB for CDN compatibility
    const client = new EasyOneClient({
      apiKey: 'up_live_test_key',
      baseUrl: 'https://example.com',
    });

    assert.strictEqual(client['config'].chunkSize, 15 * 1024 * 1024);
  });

  it('should validate API key format', () => {
    // Valid keys should succeed
    assert.doesNotThrow(() => {
      new EasyOneClient({ apiKey: 'up_live_valid_key' });
    });

    // Invalid key should throw
    assert.throws(() => {
      new EasyOneClient({ apiKey: 'invalid_key' });
    }, /Invalid API key format/);

    assert.throws(() => {
      new EasyOneClient({ apiKey: 'up_test_valid_key' });
    }, /Invalid API key format/);
  });

  it('should reject empty API key', () => {
    assert.throws(() => {
      new EasyOneClient({ apiKey: '' });
    }, /API key cannot be empty/);
  });

  it('should trim whitespace from API key', () => {
    const client = new EasyOneClient({
      apiKey: '  up_live_test_key_with_spaces  ',
    });

    assert.strictEqual(client['config'].apiKey, 'up_live_test_key_with_spaces');
  });
});
