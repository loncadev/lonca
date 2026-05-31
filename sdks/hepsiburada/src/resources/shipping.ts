import { TokenBucketRateLimiter, ValidationError } from '@lonca/core';
import type { HepsiburadaTransport } from '../transport.js';
import type { CargoFirm, ShippingProfile, ShippingProfileInput } from '../types/shipping.js';

const SERVICE = 'shipping' as const;

interface WireCargoFirm {
  id?: string | number;
  name?: string;
  code?: string;
  [key: string]: unknown;
}

interface WireProfile {
  profileName?: string;
  [key: string]: unknown;
}

/**
 * Hepsiburada Shipping (`shipping-entegrasyonu`) — cargo firm catalog +
 * merchant shipping profile management.
 *
 * **Service base URL**: `shipping-external[-sit].hepsiburada.com`.
 *
 * Hepsiburada's published OpenAPI for this surface lists 4 paths but
 * leaves body schemas / response schemas empty. The SDK exposes the
 * documented paths typed and accepts loose `Record<string, unknown>`
 * payloads — see the developer-portal doc page for field rules.
 */
export class ShippingResource {
  private readonly limiter: TokenBucketRateLimiter;

  constructor(
    private readonly transport: HepsiburadaTransport,
    limiter?: TokenBucketRateLimiter,
  ) {
    this.limiter = limiter ?? new TokenBucketRateLimiter({ capacity: 60, intervalMs: 60_000 });
  }

  /** List the cargo firms Hepsiburada supports for the merchant. */
  async getCargoFirms(): Promise<CargoFirm[]> {
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: `/cargoFirms/${encodeURIComponent(this.transport.merchantId)}`,
      rateLimiter: this.limiter,
    });
    const rows = Array.isArray(data)
      ? data
      : Array.isArray((data as { items?: unknown[] })?.items)
        ? (data as { items: unknown[] }).items
        : Array.isArray((data as { data?: unknown[] })?.data)
          ? (data as { data: unknown[] }).data
          : [];
    return rows.map((r) => {
      const row = r as WireCargoFirm;
      const out: CargoFirm = { raw: row as Record<string, unknown> };
      if (row.id !== undefined) out.id = row.id;
      if (row.name !== undefined) out.name = row.name;
      if (row.code !== undefined) out.code = row.code;
      return out;
    });
  }

  /** List the merchant's configured shipping profiles. */
  async listProfiles(): Promise<ShippingProfile[]> {
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: `/profiles/${encodeURIComponent(this.transport.merchantId)}`,
      rateLimiter: this.limiter,
    });
    const rows = Array.isArray(data)
      ? data
      : Array.isArray((data as { items?: unknown[] })?.items)
        ? (data as { items: unknown[] }).items
        : Array.isArray((data as { data?: unknown[] })?.data)
          ? (data as { data: unknown[] }).data
          : [];
    return rows.map((r) => {
      const row = r as WireProfile;
      const out: ShippingProfile = { raw: row as Record<string, unknown> };
      if (row.profileName !== undefined) out.profileName = row.profileName;
      return out;
    });
  }

  /**
   * Create a new shipping profile.
   *
   * @throws {ValidationError} when `input` is empty / missing fields HB requires.
   */
  async createProfile(input: ShippingProfileInput): Promise<unknown> {
    if (!input || typeof input !== 'object') {
      throw new ValidationError({ message: 'shipping.createProfile: input is required' });
    }
    return this.transport.request<unknown>({
      method: 'POST',
      service: SERVICE,
      path: `/profile/createByMerchantId`,
      body: input,
      rateLimiter: this.limiter,
    });
  }

  /** Update an existing shipping profile. Same body shape as `createProfile`. */
  async updateProfile(input: ShippingProfileInput): Promise<unknown> {
    if (!input || typeof input !== 'object') {
      throw new ValidationError({ message: 'shipping.updateProfile: input is required' });
    }
    return this.transport.request<unknown>({
      method: 'PUT',
      service: SERVICE,
      path: `/profile/updateByMerchantId`,
      body: input,
      rateLimiter: this.limiter,
    });
  }
}
