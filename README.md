# EasyOne TypeScript SDK

Official TypeScript/JavaScript SDK for interacting with EasyOne API. Provides client-side AES-GCM encryption and chunked upload functionality.

## Installation

```bash
npm install @ez1/typescript-sdk
```

## Quick Start

```typescript
import { EasyOneClient } from '@ez1/typescript-sdk';

const client = new EasyOneClient({
  apiKey: 'up_live_YOUR_KEY_HERE', // Replace with your actual API key
  baseUrl: 'https://file.ez1.cc', // optional
});

// Blob, Uint8Array, ReadableStream, and AsyncIterable inputs are supported.
const result = await client.uploadFile({
  data: file,
  name: 'my-file.pdf',
  type: 'application/pdf',
  size: file.size,
}, {
  retentionDays: 30, // Days to keep the file (default: 30)
  // Set to 0 for indefinite retention (requires unlimited retention permission)
  private: true, // Optional, Basic plan or higher: restrict access to the uploader
});

console.log(`CID: ${result.cid}`);
console.log(`Decryption Key: ${result.decryptionKey}`);
```

All uploads encrypt filename, MIME type, and original size as client-side metadata. Embedding is disabled by default and must be explicitly enabled with `embed: true`. Private uploads and uploads with a download limit cannot enable embedding.

## Downloading a File

```typescript
// Download and decrypt a file
const download = await client.downloadFile(
  result.cid,
  result.decryptionKey
);

// Save to disk (browser)
const blob = await new Response(download.stream, {
  headers: { 'Content-Type': download.mimeType },
}).blob();
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'my-file.pdf';
a.click();
```

In Node.js ESM, pipe the returned web stream to any Node writable stream:

```typescript
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const download = await client.downloadFile(result.cid, result.decryptionKey);
await pipeline(
  Readable.fromWeb(download.stream),
  createWriteStream(download.filename),
);
```

## Listing Files

```typescript
const files = await client.listFiles({ limit: 20 });

for (const file of files.files) {
  console.log(`${file.id} - encrypted metadata: ${Boolean(file.encryptedMetadata)}`);
}

const metadata = await client.getMetadata('content-id');
if (metadata.encryptedMetadata) {
  const plain = await client.decryptMetadata(metadata.encryptedMetadata, 'decryption-key');
  console.log(`${plain.filename} (${plain.size} bytes)`);
}
```

## Encryption Only

```typescript
// Encrypt data without uploading
const data = new TextEncoder().encode('Secret message');
const { encrypted, key } = await client.encryptData(data);

// Decrypt later
const decrypted = await client.decryptData(encrypted, key);
console.log(new TextDecoder().decode(decrypted));
```

## API Reference

### `EasyOneClient`

#### Constructor

```typescript
new EasyOneClient(config: {
  apiKey: string;
  baseUrl?: string;
})
```

#### Methods

- `uploadFile({ data, name, type, size }, options?)` - Encrypt and upload a bounded-memory input stream
- `downloadFile(cid, decryptionKey)` - Return metadata and a decrypted `ReadableStream<Uint8Array>`
- `getDownloadInfo(cid)` - Get download URL and metadata
- `getMetadata(cid)` - Get file metadata
- `listFiles(options?)` - List user's files
- `buildEncryptedMetadata(metadata, decryptionKey)` - Build encrypted metadata for low-level multipart flows
- `decryptMetadata(encryptedMetadata, decryptionKey)` - Decrypt metadata returned by API responses
- `encryptData(data)` - Encrypt data without uploading
- `decryptData(encryptedData, key)` - Decrypt data

## Security Best Practices

### API Key Storage

- Store API keys in environment variables
- Never commit keys to version control
- Use different keys for development/staging/production
- Rotate keys regularly (recommended: every 90 days)

```bash
# .env file
EASYONE_API_KEY=up_live_YOUR_KEY_HERE
```

### Decryption Key Management

- Store decryption keys in encrypted storage (e.g., AWS KMS, Azure Key Vault)
- Never log decryption keys
- Implement key rotation for encrypted files

### Client-Side Validation

The SDK now includes:
- API key format validation (must start with `up_live_`)
- File size validation (max 100GB)
- File type validation (blocks executable files)

The declared upload size must exactly match the input stream. Custom streams must emit non-empty chunks no larger than 15 MiB. Downloads authenticate each encrypted chunk before exposing its plaintext and reject truncated or trailing ciphertext.

## License

MIT
