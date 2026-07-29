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
        isPrivate: false,
        embeddingDisabled: true,
        encryptedMetadata: 'AAAAAAAAAAAAAAAABBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      }
    );

    assert.strictEqual(mockFetch.mock.calls.length, 1);
    assert.strictEqual(resultCid, 'server-generated-cid');
  });

  it('should reject upload chunk calls without encrypted metadata', async () => {
    await assert.rejects(
      client['uploadChunk'](undefined, 0, 1, new ArrayBuffer(100), {
        fileName: 'missing.txt',
        fileSize: 100,
        mimeType: 'text/plain',
        retentionDays: 30,
        downloadLimit: null,
        isPrivate: false,
        embeddingDisabled: true,
        encryptedMetadata: '',
      }),
      /encryptedMetadata is required/
    );
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
        isPrivate: false,
        embeddingDisabled: true,
        encryptedMetadata: 'AAAAAAAAAAAAAAAABBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      }
    );

    assert.strictEqual(mockFetch.mock.calls.length, 1);
    assert.strictEqual(resultCid, 'server-generated-cid');
  });

  it('should upload only the visible bytes of a Node Buffer', async (t) => {
    let uploadRequest: RequestInit | undefined;
    const mockFetch = t.mock.method(globalThis, 'fetch', async (_url, init) => {
      uploadRequest = init as RequestInit;
      return {
        ok: true,
        status: 200,
        json: async () => ({ cid: 'server-generated-cid', success: true, message: 'Upload complete' }),
      } as Response;
    });

    const pooled = Buffer.allocUnsafe(64);
    pooled.fill(0x61);
    const visible = pooled.subarray(10, 13);

    const result = await client.uploadFile({
      data: visible,
      name: 'buffer.txt',
      type: 'text/plain',
      size: visible.byteLength,
    });

    assert.strictEqual(result.cid, 'server-generated-cid');
    assert.strictEqual(mockFetch.mock.calls.length, 1);
    assert.ok(uploadRequest);

    const headers = uploadRequest!.headers as Record<string, string>;
    assert.strictEqual(headers['x-file-name'], 'encrypted-metadata');
    assert.strictEqual(headers['x-file-size'], '3');
    assert.strictEqual(headers['x-mime-type'], 'application/octet-stream');
    assert.ok(headers['x-encrypted-metadata']);
    assert.strictEqual(headers['x-embedding-disabled'], 'true');
    assert.strictEqual((uploadRequest!.body as Uint8Array).byteLength, 3 + 28);
  });

  it('should send the private upload option', async (t) => {
    let uploadRequest: RequestInit | undefined;
    t.mock.method(globalThis, 'fetch', async (_url, init) => {
      uploadRequest = init as RequestInit;
      return {
        ok: true,
        status: 200,
        json: async () => ({ cid: 'server-generated-cid', success: true, message: 'Upload complete' }),
      } as Response;
    });

    await client.uploadFile({
      data: new TextEncoder().encode('abc'),
      name: 'private.txt',
      type: 'text/plain',
      size: 3,
    }, { private: true });

    const headers = uploadRequest!.headers as Record<string, string>;
    assert.strictEqual(headers['x-private'], 'true');
    assert.strictEqual(headers['x-embedding-disabled'], 'true');
  });

  it('should enable embedding only when explicitly requested', async (t) => {
    let uploadRequest: RequestInit | undefined;
    t.mock.method(globalThis, 'fetch', async (_url, init) => {
      uploadRequest = init as RequestInit;
      return Response.json({ cid: 'server-generated-cid' });
    });

    await client.uploadFile({
      data: new Uint8Array([1]),
      name: 'embeddable.bin',
      type: 'application/octet-stream',
      size: 1,
    }, { embed: true });

    const headers = uploadRequest!.headers as Record<string, string>;
    assert.strictEqual(headers['x-embedding-disabled'], 'false');
  });

  it('should reject embedding with private access or a download limit', async () => {
    const file = {
      data: new Uint8Array([1]),
      name: 'conflict.bin',
      type: 'application/octet-stream',
      size: 1,
    };
    await assert.rejects(
      client.uploadFile(file, { embed: true, private: true }),
      /embed cannot be enabled/
    );
    await assert.rejects(
      client.uploadFile(file, { embed: true, downloadLimit: 1 }),
      /embed cannot be enabled/
    );
  });

  it('should stream arbitrary source chunks into protocol-sized chunks', async (t) => {
    const bodies: Uint8Array[] = [];
    t.mock.method(globalThis, 'fetch', async (_url, init) => {
      bodies.push(init!.body as Uint8Array);
      return {
        ok: true,
        status: 200,
        json: async () => ({ cid: 'server-generated-cid' }),
      } as Response;
    });

    async function* source() {
      yield new Uint8Array([1]);
      yield new Uint8Array([2, 3]);
    }

    await client.uploadFile({
      data: source(),
      name: 'stream.bin',
      type: 'application/octet-stream',
      size: 3,
    });

    assert.strictEqual(bodies.length, 1);
    assert.strictEqual(bodies[0].byteLength, 31);
  });

  it('should reject upload size mismatches', async () => {
    await assert.rejects(
      client.uploadFile({
        data: new Uint8Array([1, 2]),
        name: 'short.bin',
        type: 'application/octet-stream',
        size: 3,
      }),
      /ended early/
    );
  });

  it('should reject trailing upload data before the final request', async (t) => {
    const mockFetch = t.mock.method(globalThis, 'fetch');
    await assert.rejects(
      client.uploadFile({
        data: new Uint8Array([1, 2, 3]),
        name: 'long.bin',
        type: 'application/octet-stream',
        size: 2,
      }),
      /trailing data/
    );
    assert.strictEqual(mockFetch.mock.calls.length, 0);
  });

  it('should stream and authenticate independently encrypted download chunks', async (t) => {
    const streamingClient = new EasyOneClient({
      apiKey: 'up_live_test12345',
      baseUrl: 'https://test.example.com',
    });
    (streamingClient as unknown as { CHUNK_SIZE: number }).CHUNK_SIZE = 4;
    const rawKey = new Uint8Array(32).fill(7);
    const key = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt']);
    const keyString = btoa(String.fromCharCode(...rawKey));
    const encrypt = async (plaintext: Uint8Array) => {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        plaintext
      ));
      const frame = new Uint8Array(iv.byteLength + ciphertext.byteLength);
      frame.set(iv);
      frame.set(ciphertext, iv.byteLength);
      return frame;
    };
    const first = await encrypt(new TextEncoder().encode('abcd'));
    const second = await encrypt(new TextEncoder().encode('efg'));
    const encrypted = new Uint8Array(first.byteLength + second.byteLength);
    encrypted.set(first);
    encrypted.set(second, first.byteLength);

    let request = 0;
    t.mock.method(globalThis, 'fetch', async () => {
      request += 1;
      if (request === 1) {
        return Response.json({
          cid: 'test-cid',
          filename: null,
          mimeType: null,
          size: null,
          downloadUrl: 'https://example.com/download/test-cid',
          expiresAt: null,
          downloadLimit: null,
          downloadCount: 0,
          encryptedMetadata: await streamingClient.buildEncryptedMetadata({
            filename: 'stream.bin',
            mimeType: 'application/octet-stream',
            size: 7,
          }, keyString),
        });
      }
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(encrypted.subarray(0, 3));
          controller.enqueue(encrypted.subarray(3, 35));
          controller.enqueue(encrypted.subarray(35));
          controller.close();
        },
      }));
    });

    const download = await streamingClient.downloadFile('test-cid', keyString);
    const plaintext = new Uint8Array(await new Response(download.stream).arrayBuffer());

    assert.deepStrictEqual(plaintext, new TextEncoder().encode('abcdefg'));
    assert.strictEqual(download.filename, 'stream.bin');
    assert.strictEqual(download.size, 7);
  });

  it('should build and decrypt encrypted metadata', async () => {
    const metadata = {
      filename: 'report.pdf',
      mimeType: 'application/pdf',
      size: 2048,
    };
    const encrypted = await client.buildEncryptedMetadata(
      metadata,
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
    );
    const decrypted = await client.decryptMetadata(
      encrypted,
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
    );

    assert.deepStrictEqual(decrypted, metadata);
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
      encryptedMetadata: 'AAAAAAAAAAAAAAAABBBBBBBBBBBBBBBBBBBBBBBBBBBB',
    });

    assert.strictEqual(result.cid, 'test-cid');
    assert.strictEqual(result.success, true);
  });

  it('should reject complete upload calls without encrypted metadata', async () => {
    await assert.rejects(
      client.completeUpload('missing-metadata', {
        fileName: 'missing.txt',
        fileSize: 1024,
        mimeType: 'text/plain',
        encryptedMetadata: '',
      }),
      /encryptedMetadata is required/
    );
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
      encryptedMetadata: 'AAAAAAAAAAAAAAAABBBBBBBBBBBBBBBBBBBBBBBBBBBB',
    });

    // Verify fetch was called
    assert.strictEqual(mockFetch.mock.calls.length, 1);
  });
});
