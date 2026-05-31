import { TokenBucketRateLimiter, ValidationError } from '@lonca/core';
import type { HepsiburadaTransport } from '../transport.js';
import type {
  CancelDiscountInput,
  CreatePercentDiscountInput,
  CreateTlDiscountInput,
  CreateXyDiscountInput,
  Discount,
  DiscountBudgets,
  DiscountLimits,
  PromotionCategory,
} from '../types/promotion.js';

const SERVICE = 'oms' as const;

/**
 * Hepsiburada Seller Promotions (`satici-promosyonu-entegrasyonu`).
 *
 * **Service base URL**: `oms-external[-sit].hepsiburada.com`. 9-endpoint
 * self-service basket-discount lifecycle:
 * - list seller's eligible product categories
 * - query budgets / limits
 * - list discounts / get single discount
 * - create three discount types (TL, %, X-buy-Y-pay)
 * - cancel a discount
 *
 * NOTE: Sandbox `beekod_dev` merchant doesn't have permission for this
 * surface; SIT calls return `403`. Endpoints typed from the developer-portal
 * spec; live-tested in production by integrators with the right scope.
 */
export class PromotionsResource {
  private readonly limiter: TokenBucketRateLimiter;

  constructor(
    private readonly transport: HepsiburadaTransport,
    limiter?: TokenBucketRateLimiter,
  ) {
    this.limiter = limiter ?? new TokenBucketRateLimiter({ capacity: 60, intervalMs: 60_000 });
  }

  // ─── Lookups ─────────────────────────────────────────────────────────────

  /** List the seller's product categories eligible for self-campaigns. */
  async listCategories(): Promise<PromotionCategory[]> {
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: `/categories/${this.merchantSegment()}`,
      rateLimiter: this.limiter,
    });
    const rows = Array.isArray(data)
      ? data
      : Array.isArray((data as { items?: unknown[] })?.items)
        ? (data as { items: unknown[] }).items
        : Array.isArray((data as { data?: unknown[] })?.data)
          ? (data as { data: unknown[] }).data
          : [];
    return rows.map((row) => {
      const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
      const out: PromotionCategory = { raw: r };
      if (typeof r.categoryId === 'number' || typeof r.categoryId === 'string') {
        out.categoryId = r.categoryId;
      }
      if (typeof r.name === 'string') out.name = r.name;
      return out;
    });
  }

  /** Get the seller's current discount budgets. */
  async getBudgets(): Promise<DiscountBudgets> {
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: `/self-campaign/${this.merchantSegment()}/budgets`,
      rateLimiter: this.limiter,
    });
    return { raw: (data && typeof data === 'object' ? data : {}) as Record<string, unknown> };
  }

  /** Get the seller's discount limits. */
  async getLimits(): Promise<DiscountLimits> {
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: `/self-campaign/${this.merchantSegment()}/limits`,
      rateLimiter: this.limiter,
    });
    return { raw: (data && typeof data === 'object' ? data : {}) as Record<string, unknown> };
  }

  /** List the seller's existing discounts. */
  async listDiscounts(): Promise<Discount[]> {
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: `/self-campaign/${this.merchantSegment()}/discounts`,
      rateLimiter: this.limiter,
    });
    const rows = Array.isArray(data)
      ? data
      : Array.isArray((data as { items?: unknown[] })?.items)
        ? (data as { items: unknown[] }).items
        : Array.isArray((data as { data?: unknown[] })?.data)
          ? (data as { data: unknown[] }).data
          : [];
    return rows.map(normalizeDiscount);
  }

  /** Get a single discount by campaign id. */
  async getDiscount(campaignId: string): Promise<Discount> {
    if (!campaignId) {
      throw new ValidationError({ message: 'promotions.getDiscount: campaignId is required' });
    }
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: `/self-campaign/${this.merchantSegment()}/discount/${encodeURIComponent(campaignId)}`,
      rateLimiter: this.limiter,
    });
    return normalizeDiscount(data);
  }

  // ─── Create / cancel ─────────────────────────────────────────────────────

  /** Create a fixed-TL basket discount. */
  async createTlDiscount(input: CreateTlDiscountInput): Promise<unknown> {
    this.assertInput(input, 'promotions.createTlDiscount');
    return this.transport.request<unknown>({
      method: 'POST',
      service: SERVICE,
      path: `/self-campaign/${this.merchantSegment()}/tl-discount`,
      body: input,
      rateLimiter: this.limiter,
    });
  }

  /** Create a percentage basket discount. */
  async createPercentDiscount(input: CreatePercentDiscountInput): Promise<unknown> {
    this.assertInput(input, 'promotions.createPercentDiscount');
    return this.transport.request<unknown>({
      method: 'POST',
      service: SERVICE,
      path: `/self-campaign/${this.merchantSegment()}/percent-discount`,
      body: input,
      rateLimiter: this.limiter,
    });
  }

  /** Create an X-buy-Y-pay basket discount. */
  async createXyDiscount(input: CreateXyDiscountInput): Promise<unknown> {
    this.assertInput(input, 'promotions.createXyDiscount');
    return this.transport.request<unknown>({
      method: 'POST',
      service: SERVICE,
      path: `/self-campaign/${this.merchantSegment()}/xy-discount`,
      body: input,
      rateLimiter: this.limiter,
    });
  }

  /** Cancel an existing discount. */
  async cancelDiscount(input: CancelDiscountInput): Promise<unknown> {
    this.assertInput(input, 'promotions.cancelDiscount');
    return this.transport.request<unknown>({
      method: 'POST',
      service: SERVICE,
      path: `/self-campaign/${this.merchantSegment()}/cancel-discount`,
      body: input,
      rateLimiter: this.limiter,
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private merchantSegment(): string {
    return encodeURIComponent(this.transport.merchantId);
  }

  private assertInput(input: unknown, methodLabel: string): void {
    if (!input || typeof input !== 'object') {
      throw new ValidationError({ message: `${methodLabel}: input is required` });
    }
  }
}

function normalizeDiscount(row: unknown): Discount {
  const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
  const out: Discount = { raw: r };
  if (typeof r.campaignId === 'string') out.campaignId = r.campaignId;
  if (typeof r.type === 'string') out.type = r.type;
  if (typeof r.status === 'string') out.status = r.status;
  if (typeof r.startDate === 'string') out.startDate = r.startDate;
  if (typeof r.endDate === 'string') out.endDate = r.endDate;
  return out;
}
