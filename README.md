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

// Upload a file
const result = await client.uploadFile(file, {
  fileName: 'my-file.pdf',
  mimeType: 'application/pdf',
  retentionDays: 30, // Days to keep the file (default: 30)
  // Set to 0 for indefinite retention (requires unlimited retention permission)
  private: true, // Basic plan or higher: uploader-only access with encrypted metadata
});

console.log(`CID: ${result.cid}`);
console.log(`Decryption Key: ${result.decryptionKey}`);
```

## Downloading a File

```typescript
// Download and decrypt a file
const blob = await client.downloadFile(
  result.cid,
  result.decryptionKey
);

// Save to disk (browser)
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'my-file.pdf';
a.click();
```

## Listing Files

```typescript
const files = await client.listFiles({ limit: 20 });

for (const file of files.files) {
  console.log(`${file.filename} - ${file.size} bytes`);
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
  chunkSize?: number;
})
```

#### Methods

- `uploadFile(file, options?)` - Upload a file with encryption
- `downloadFile(cid, decryptionKey, outputPath?)` - Download and decrypt a file
- `getDownloadInfo(cid)` - Get download URL and metadata
- `getMetadata(cid)` - Get file metadata
- `listFiles(options?)` - List user's files
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

## License

MIT
