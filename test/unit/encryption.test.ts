/**
 * Unit tests for encryption/decryption functionality.
 */

import { describe, it, before, mock } from 'node:test';
import assert from 'node:assert';
import { EasyOneClient } from '../../src/index';

// Initialize Web Crypto API for Node.js
if (typeof globalThis.crypto === 'undefined') {
  const { webcrypto } = await import('crypto');
  globalThis.crypto = webcrypto;
}

describe('unit: encryption', () => {
  let client: EasyOneClient;

  before(() => {
    client = new EasyOneClient({
      apiKey: 'up_live_test',
      baseUrl: 'https://test.example.com',
    });
  });

  it('should generate encryption key', async () => {
    const data = new TextEncoder().encode('Test data');
    const result = await client.encryptData(data);

    assert.ok(result.encrypted instanceof ArrayBuffer);
    assert.strictEqual(typeof result.key, 'string');
    assert.strictEqual(result.key.length, 44); // Base64 encoded 32 bytes
  });

  it('should generate unique keys', async () => {
    const keys = new Set<string>();
    const data = new TextEncoder().encode('Test');

    for (let i = 0; i < 100; i++) {
      const result = await client.encryptData(data);
      keys.add(result.key);
    }

    assert.strictEqual(keys.size, 100);
  });

  it('should encrypt and decrypt round trip', async () => {
    const originalData = new TextEncoder().encode('Hello, World! This is test data for encryption.');
    const encrypted = await client.encryptData(originalData);
    const decrypted = await client.decryptData(encrypted.encrypted, encrypted.key);

    assert.deepStrictEqual(
      new Uint8Array(decrypted),
      new Uint8Array(originalData)
    );
  });

  it('should encrypt empty data', async () => {
    const originalData = new TextEncoder().encode('');
    const encrypted = await client.encryptData(originalData);
    const decrypted = await client.decryptData(encrypted.encrypted, encrypted.key);

    assert.deepStrictEqual(
      new Uint8Array(decrypted),
      new Uint8Array(originalData)
    );
  });

  it('should encrypt large data (1MB)', async () => {
    const originalData = new Uint8Array(1024 * 1024).fill(65); // 1MB of 'A'
    const encrypted = await client.encryptData(originalData);
    const decrypted = await client.decryptData(encrypted.encrypted, encrypted.key);

    assert.deepStrictEqual(
      new Uint8Array(decrypted),
      new Uint8Array(originalData)
    );
  });

  it('should encrypt binary data with all byte values', async () => {
    const originalData = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      originalData[i] = i;
    }

    const encrypted = await client.encryptData(originalData);
    const decrypted = await client.decryptData(encrypted.encrypted, encrypted.key);

    assert.deepStrictEqual(
      new Uint8Array(decrypted),
      new Uint8Array(originalData)
    );
  });

  it('should fail to decrypt with wrong key', async () => {
    const originalData = new TextEncoder().encode('Secret data');
    const encrypted1 = await client.encryptData(originalData);
    const encrypted2 = await client.encryptData(originalData); // Different key

    await assert.rejects(
      async () => {
        await client.decryptData(encrypted1.encrypted, encrypted2.key);
      }
    );
  });

  it('should fail to decrypt tampered data', async () => {
    const originalData = new TextEncoder().encode('Secret data');
    const encrypted = await client.encryptData(originalData);

    // Tamper with the encrypted data
    const tampered = new Uint8Array(encrypted.encrypted);
    tampered[tampered.length - 1] ^= 0xFF;

    await assert.rejects(
      async () => {
        await client.decryptData(tampered.buffer, encrypted.key);
      }
    );
  });

  it('should add IV to encrypted data', async () => {
    const originalData = new TextEncoder().encode('Test data');
    const encrypted = await client.encryptData(originalData);

    // Encrypted data should be longer than original (IV + ciphertext + tag)
    assert.ok(encrypted.encrypted.byteLength > originalData.byteLength);
    // IV is 12 bytes, GCM tag is 16 bytes
    assert.ok(encrypted.encrypted.byteLength >= originalData.byteLength + 12 + 16);
  });

  it('should produce different encrypted data for same input', async () => {
    const originalData = new TextEncoder().encode('Same data');
    const encrypted1 = await client.encryptData(originalData);
    const encrypted2 = await client.encryptData(originalData);

    // Encrypted data should be different (different IVs)
    const arr1 = new Uint8Array(encrypted1.encrypted);
    const arr2 = new Uint8Array(encrypted2.encrypted);
    assert.notDeepStrictEqual(arr1, arr2);

    // But both should decrypt to the same value
    const decrypted1 = await client.decryptData(encrypted1.encrypted, encrypted1.key);
    const decrypted2 = await client.decryptData(encrypted2.encrypted, encrypted2.key);
    assert.deepStrictEqual(new Uint8Array(decrypted1), new Uint8Array(decrypted2));
  });
});
