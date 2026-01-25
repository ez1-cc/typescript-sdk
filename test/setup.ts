/**
 * Test setup and configuration for TypeScript SDK tests.
 */

import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load test environment variables
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env.test');

// Try to load .env.test file
try {
  config({ path: envPath });
} catch {
  // .env.test file not found, use default values
}

export interface TestConfig {
  apiBaseUrl: string;
  cdnBaseUrl: string;
  testApiKey: string;
  defaultChunkSize: number;
  defaultRetentionDays: number;
  runIntegrationTests: boolean;
  mockApiResponses: boolean;
  coverageMinPercent: number;
}

/**
 * Get test configuration from environment variables.
 */
export function getTestConfig(): TestConfig {
  return {
    apiBaseUrl: process.env.API_BASE_URL || 'https://file.ez1.cc',
    cdnBaseUrl: process.env.CDN_BASE_URL || 'https://serve.ez1.cc',
    testApiKey: process.env.TEST_API_KEY || '',
    defaultChunkSize: parseInt(process.env.DEFAULT_CHUNK_SIZE || '15728640', 10),
    defaultRetentionDays: parseInt(process.env.DEFAULT_RETENTION_DAYS || '30', 10),
    runIntegrationTests: process.env.RUN_INTEGRATION_TESTS === 'true',
    mockApiResponses: process.env.MOCK_API_RESPONSES !== 'false',
    coverageMinPercent: parseInt(process.env.COVERAGE_MIN_PERCENT || '80', 10),
  };
}

/**
 * Check if integration tests should be skipped.
 */
export function shouldSkipIntegration(): boolean {
  const config = getTestConfig();
  return !config.runIntegrationTests || !config.testApiKey;
}

/**
 * Mock API key for unit tests.
 */
export const MOCK_API_KEY = 'test_api_key_12345';

/**
 * Mock base URL for unit tests.
 */
export const MOCK_BASE_URL = 'https://test.example.com';

/**
 * Sample content ID for tests.
 */
export const SAMPLE_CID = '550e8400-e29b-41d4-a716-446655440000';

/**
 * Sample decryption key for tests.
 */
export const SAMPLE_DECRYPTION_KEY = btoa('test_key_32_bytes_long_encryption');

// Export config for use in tests
export const testConfig = getTestConfig();
