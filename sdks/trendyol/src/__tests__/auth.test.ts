import { describe, expect, it } from 'vitest';
import { buildAuthHeader, buildUserAgent } from '../auth.js';

describe('buildAuthHeader', () => {
  it('produces a Basic-auth header from key and secret', () => {
    const header = buildAuthHeader('mykey', 'mysecret');
    expect(header.startsWith('Basic ')).toBe(true);
    const token = header.slice('Basic '.length);
    expect(Buffer.from(token, 'base64').toString('utf8')).toBe('mykey:mysecret');
  });

  it('handles non-ASCII characters in credentials', () => {
    const header = buildAuthHeader('ürün', 'şifre');
    const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
    expect(decoded).toBe('ürün:şifre');
  });
});

describe('buildUserAgent', () => {
  it('formats sellerId and integratorName per Trendyol docs', () => {
    expect(buildUserAgent(1234, 'SelfIntegration')).toBe('1234 - SelfIntegration');
  });

  it('uses the provided integratorName', () => {
    expect(buildUserAgent(1234, 'AcmeCo')).toBe('1234 - AcmeCo');
  });
});
