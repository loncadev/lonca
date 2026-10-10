import { TokenBucketRateLimiter } from '@lonca/core';
import type { TrendyolTransport } from '../transport.js';
import type { City, Country, District, Neighborhood } from '../types/misc.js';

/**
 * One country / city / district row. City rows carry no country field (docs and prod wire agree:
 * `id`, `code`, `name`), so `City.countryCode` is the country code of the lookup that returned the
 * row. District rows carry no city reference either (prod wire 2026-10-10: `id`, `code`, `name`).
 */
interface WireNode {
  code?: number | string;
  id?: number | string;
  name?: string;
  [key: string]: unknown;
}

/**
 * One neighborhood row. The prod wire (2026-10-10) sends `id`, `name` and `postCode` — no `code`
 * and no district reference; the docs list `id` and `name` only.
 */
interface WireNeighborhoodNode {
  id?: number | string;
  name?: string;
  postCode?: string;
  [key: string]: unknown;
}

function n<T extends { code: string; raw: Record<string, unknown> }, W = WireNode>(
  rows: unknown,
  extract: (node: W) => Omit<T, 'raw'>,
): T[] {
  const list = Array.isArray(rows) ? rows : [];
  return list.map((r) => {
    const node = r as W;
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
    return this.cities(`/integration/member/countries/domestic/TR/cities`, 'TR');
  }

  /**
   * List districts for a Turkish city. **Pass the city `id`** (`City.id`) — the
   * nested endpoint keys off Trendyol's internal id, not the display `code`, and
   * returns 500 for the code. Verified live.
   */
  async getTurkeyDistricts(cityId: string | number): Promise<District[]> {
    return this.districts(
      `/integration/member/countries/domestic/TR/cities/${encodeURIComponent(String(cityId))}/districts`,
    );
  }

  /**
   * List neighborhoods for a Turkish district. **Pass the ids** (`City.id`,
   * `District.id`) — not the display codes (those 500).
   */
  async getTurkeyNeighborhoods(
    cityId: string | number,
    districtId: string | number,
  ): Promise<Neighborhood[]> {
    return this.neighborhoods(
      `/integration/member/countries/domestic/TR/cities/${encodeURIComponent(String(cityId))}/districts/${encodeURIComponent(String(districtId))}/neighborhoods`,
    );
  }

  async getAzerbaijanCities(): Promise<City[]> {
    return this.cities(`/integration/member/countries/domestic/AZ/cities`, 'AZ');
  }

  /** List districts for an Azerbaijani city. **Pass the city `id`** (`City.id`), not `code`. */
  async getAzerbaijanDistricts(cityId: string | number): Promise<District[]> {
    return this.districts(
      `/integration/member/countries/domestic/AZ/cities/${encodeURIComponent(String(cityId))}/districts`,
    );
  }

  // ─── International (GULF / CEE) ───────────────────────────────────────

  async getCitiesByCountry(countryCode: string): Promise<City[]> {
    return this.cities(
      `/integration/member/countries/${encodeURIComponent(countryCode)}/cities`,
      countryCode,
    );
  }

  async getDistrictsByCity(countryCode: string, cityId: string | number): Promise<District[]> {
    return this.districts(
      `/integration/member/countries/${encodeURIComponent(countryCode)}/cities/${encodeURIComponent(String(cityId))}/districts`,
    );
  }

  // ─── Shared paginators ────────────────────────────────────────────────

  /** `countryCode` is the lookup's country — city rows do not carry one on the wire. */
  private async cities(path: string, countryCode: string): Promise<City[]> {
    const data = await this.transport.request<unknown[]>({
      method: 'GET',
      path,
      rateLimiter: this.limiter,
    });
    return n<City>(data, (node) => ({
      id: node.id !== undefined ? String(node.id) : undefined,
      code: String(node.code ?? node.id ?? ''),
      name: node.name,
      countryCode,
    }));
  }

  private async districts(path: string): Promise<District[]> {
    const data = await this.transport.request<unknown[]>({
      method: 'GET',
      path,
      rateLimiter: this.limiter,
    });
    return n<District>(data, (node) => ({
      id: node.id !== undefined ? String(node.id) : undefined,
      code: String(node.code ?? node.id ?? ''),
      name: node.name,
    }));
  }

  private async neighborhoods(path: string): Promise<Neighborhood[]> {
    const data = await this.transport.request<unknown[]>({
      method: 'GET',
      path,
      rateLimiter: this.limiter,
    });
    return n<Neighborhood, WireNeighborhoodNode>(data, (node) => {
      const id = node.id !== undefined ? String(node.id) : undefined;
      return {
        id,
        // Neighborhood rows have no code; `code` mirrors the id (as it always did in practice).
        code: id ?? '',
        name: node.name,
        postCode: typeof node.postCode === 'string' ? node.postCode : undefined,
      };
    });
  }
}
