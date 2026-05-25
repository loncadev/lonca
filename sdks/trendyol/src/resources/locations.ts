import { TokenBucketRateLimiter } from '@lonca/core';
import type { TrendyolTransport } from '../transport.js';
import type { City, Country, District, Neighborhood } from '../types/misc.js';

interface WireNode {
  code?: number | string;
  id?: number | string;
  cityCode?: number | string;
  countryCode?: string;
  districtCode?: number | string;
  name?: string;
  [key: string]: unknown;
}

function n<T extends { code: string; raw: Record<string, unknown> }>(
  rows: unknown,
  extract: (node: WireNode) => Omit<T, 'raw'>,
): T[] {
  const list = Array.isArray(rows) ? rows : [];
  return list.map((r) => {
    const node = r as WireNode;
    return { ...extract(node), raw: node as Record<string, unknown> } as T;
  });
}

/**
 * Trendyol location lookups for building shipment / invoice addresses
 * with the correct city / district / neighborhood codes.
 *
 * Trendyol exposes these under a different prefix (`/integration/member/`)
 * — not under `/integration/order/` or `/integration/product/`.
 */
export class LocationsResource {
  private readonly limiter: TokenBucketRateLimiter;

  constructor(
    private readonly transport: TrendyolTransport,
    limiter?: TokenBucketRateLimiter,
  ) {
    this.limiter = limiter ?? new TokenBucketRateLimiter({ capacity: 60, intervalMs: 60_000 });
  }

  /** List all supported countries (Türkiye + AZ + GULF + CEE). */
  async getCountries(): Promise<Country[]> {
    const data = await this.transport.request<unknown[]>({
      method: 'GET',
      path: `/integration/member/countries`,
      rateLimiter: this.limiter,
    });
    return n<Country>(data, (node) => ({
      code: String(node.code ?? node.id ?? ''),
      name: node.name,
    }));
  }

  // ─── Domestic (TR / AZ) ───────────────────────────────────────────────

  async getTurkeyCities(): Promise<City[]> {
    return this.cities(`/integration/member/countries/domestic/TR/cities`);
  }

  async getTurkeyDistricts(cityCode: string | number): Promise<District[]> {
    return this.districts(
      `/integration/member/countries/domestic/TR/cities/${encodeURIComponent(String(cityCode))}/districts`,
    );
  }

  async getTurkeyNeighborhoods(
    cityCode: string | number,
    districtCode: string | number,
  ): Promise<Neighborhood[]> {
    return this.neighborhoods(
      `/integration/member/countries/domestic/TR/cities/${encodeURIComponent(String(cityCode))}/districts/${encodeURIComponent(String(districtCode))}/neighborhoods`,
    );
  }

  async getAzerbaijanCities(): Promise<City[]> {
    return this.cities(`/integration/member/countries/domestic/AZ/cities`);
  }

  async getAzerbaijanDistricts(cityCode: string | number): Promise<District[]> {
    return this.districts(
      `/integration/member/countries/domestic/AZ/cities/${encodeURIComponent(String(cityCode))}/districts`,
    );
  }

  // ─── International (GULF / CEE) ───────────────────────────────────────

  async getCitiesByCountry(countryCode: string): Promise<City[]> {
    return this.cities(`/integration/member/countries/${encodeURIComponent(countryCode)}/cities`);
  }

  async getDistrictsByCity(countryCode: string, cityId: string | number): Promise<District[]> {
    return this.districts(
      `/integration/member/countries/${encodeURIComponent(countryCode)}/cities/${encodeURIComponent(String(cityId))}/districts`,
    );
  }

  // ─── Shared paginators ────────────────────────────────────────────────

  private async cities(path: string): Promise<City[]> {
    const data = await this.transport.request<unknown[]>({
      method: 'GET',
      path,
      rateLimiter: this.limiter,
    });
    return n<City>(data, (node) => ({
      code: String(node.code ?? node.id ?? ''),
      name: node.name,
      countryCode: node.countryCode,
    }));
  }

  private async districts(path: string): Promise<District[]> {
    const data = await this.transport.request<unknown[]>({
      method: 'GET',
      path,
      rateLimiter: this.limiter,
    });
    return n<District>(data, (node) => ({
      code: String(node.code ?? node.id ?? ''),
      name: node.name,
      cityCode: node.cityCode !== undefined ? String(node.cityCode) : undefined,
    }));
  }

  private async neighborhoods(path: string): Promise<Neighborhood[]> {
    const data = await this.transport.request<unknown[]>({
      method: 'GET',
      path,
      rateLimiter: this.limiter,
    });
    return n<Neighborhood>(data, (node) => ({
      code: String(node.code ?? node.id ?? ''),
      name: node.name,
      districtCode: node.districtCode !== undefined ? String(node.districtCode) : undefined,
    }));
  }
}
