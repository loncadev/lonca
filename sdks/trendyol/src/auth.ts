/** Build the HTTP Basic auth header value from Trendyol credentials. */
export function buildAuthHeader(apiKey: string, apiSecret: string): string {
  const token = Buffer.from(`${apiKey}:${apiSecret}`, 'utf8').toString('base64');
  return `Basic ${token}`;
}

/**
 * Build the `User-Agent` header value Trendyol expects.
 *
 * Per Trendyol's docs:
 * - Solo integrators: `"<sellerId> - SelfIntegration"`
 * - Integrator companies: `"<sellerId> - <CompanyName>"` (alphanumeric, max 30 chars)
 *
 * A missing or malformed `User-Agent` triggers HTTP 403.
 */
export function buildUserAgent(sellerId: number, integratorName = 'SelfIntegration'): string {
  return `${sellerId} - ${integratorName}`;
}
