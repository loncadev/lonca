import { TokenBucketRateLimiter, ValidationError } from '@lonca/core';
import type { TrendyolTransport } from '../transport.js';
import type { Webhook, WebhookInput } from '../types/webhook.js';

/** Trendyol caps webhook subscriptions per seller. */
const MAX_WEBHOOKS_PER_SELLER = 15;

interface WireWebhook {
  id?: string | number;
  url?: string;
  authenticationType?: 'BASIC_AUTHENTICATION' | 'API_KEY';
  username?: string;
  apiKey?: string;
  subscribedStatuses?: string[];
  active?: boolean;
  isActive?: boolean;
  status?: string;
  [key: string]: unknown;
}

function normalizeWebhook(node: WireWebhook): Webhook {
  const out: Webhook = {
    id: node.id !== undefined ? String(node.id) : '',
    raw: node as Record<string, unknown>,
  };
  if (node.url !== undefined) out.url = node.url;
  if (node.authenticationType !== undefined) out.authenticationType = node.authenticationType;
  if (node.username !== undefined) out.username = node.username;
  if (node.apiKey !== undefined) out.apiKey = node.apiKey;
  if (node.subscribedStatuses !== undefined) out.subscribedStatuses = node.subscribedStatuses;
  // Trendyol's active flag has been seen as `active`, `isActive`, or `status: 'ACTIVE'` —
  // accept all defensively until we observe a single stable shape.
  if (typeof node.active === 'boolean') out.active = node.active;
  else if (typeof node.isActive === 'boolean') out.active = node.isActive;
  else if (typeof node.status === 'string') out.active = node.status.toUpperCase() === 'ACTIVE';
  return out;
}

/**
 * Trendyol webhook subscription management.
 *
 * Max **15 active webhooks per seller** (Trendyol-enforced). Webhooks
 * fire on shipment-package status events only — there is no webhook
 * support for product / stock changes.
 *
 * Trendyol's gateway authenticates **against your endpoint** with the
 * `authenticationType` you configure. Pick `API_KEY` over
 * `BASIC_AUTHENTICATION` so you can rotate the secret without redeploying.
 *
 * No HMAC signature — security relies entirely on the auth method you
 * pick + the secret you store with Trendyol.
 */
export class WebhooksResource {
  private readonly limiter: TokenBucketRateLimiter;

  constructor(
    private readonly transport: TrendyolTransport,
    limiter?: TokenBucketRateLimiter,
  ) {
    this.limiter = limiter ?? new TokenBucketRateLimiter({ capacity: 50, intervalMs: 60_000 });
  }

  /**
   * Create a new webhook subscription. Trendyol caps subscriptions at 15
   * per seller — the SDK does NOT pre-check (you'd need to call `list()`
   * first), but Trendyol returns 400 when the cap is exceeded.
   *
   * @throws {ValidationError} when `url` or `authenticationType` is missing.
   */
  async create(input: WebhookInput): Promise<unknown> {
    this.validateInput(input, 'create');
    return this.transport.request<unknown>({
      method: 'POST',
      path: `/integration/sellers/${this.transport.sellerId}/webhooks`,
      body: input,
      rateLimiter: this.limiter,
    });
  }

  /** List all registered webhook subscriptions. */
  async list(): Promise<Webhook[]> {
    const data = await this.transport.request<unknown>({
      method: 'GET',
      path: `/integration/sellers/${this.transport.sellerId}/webhooks`,
      rateLimiter: this.limiter,
    });
    const rows = Array.isArray(data)
      ? data
      : Array.isArray((data as { webhooks?: unknown[] })?.webhooks)
        ? (data as { webhooks: unknown[] }).webhooks
        : Array.isArray((data as { content?: unknown[] })?.content)
          ? (data as { content: unknown[] }).content
          : [];
    return rows.map((r) => normalizeWebhook(r as WireWebhook));
  }

  /**
   * Update a webhook subscription. Same input shape as `create`; replaces
   * the whole subscription (Trendyol does NOT partially update).
   */
  async update(webhookId: string | number, input: WebhookInput): Promise<unknown> {
    this.validateInput(input, 'update');
    return this.transport.request<unknown>({
      method: 'PUT',
      path: this.webhookPath(webhookId),
      body: input,
      rateLimiter: this.limiter,
    });
  }

  /** Permanently delete a webhook subscription. */
  async delete(webhookId: string | number): Promise<unknown> {
    return this.transport.request<unknown>({
      method: 'DELETE',
      path: this.webhookPath(webhookId),
      rateLimiter: this.limiter,
    });
  }

  /** Re-activate a previously-deactivated webhook subscription. */
  async activate(webhookId: string | number): Promise<unknown> {
    return this.transport.request<unknown>({
      method: 'PUT',
      path: `${this.webhookPath(webhookId)}/activate`,
      rateLimiter: this.limiter,
    });
  }

  /**
   * Deactivate a webhook subscription. Trendyol automatically deactivates
   * a subscription after persistent delivery failures (and sends 2 emails);
   * use `activate()` to bring it back online once your endpoint is healthy.
   */
  async deactivate(webhookId: string | number): Promise<unknown> {
    return this.transport.request<unknown>({
      method: 'PUT',
      path: `${this.webhookPath(webhookId)}/deactivate`,
      rateLimiter: this.limiter,
    });
  }

  private validateInput(input: WebhookInput, method: string): void {
    if (!input?.url || typeof input.url !== 'string') {
      throw new ValidationError({ message: `webhooks.${method}: url is required` });
    }
    if (
      input.authenticationType !== 'BASIC_AUTHENTICATION' &&
      input.authenticationType !== 'API_KEY'
    ) {
      throw new ValidationError({
        message: `webhooks.${method}: authenticationType must be 'BASIC_AUTHENTICATION' or 'API_KEY'`,
      });
    }
    if (input.authenticationType === 'BASIC_AUTHENTICATION') {
      if (!input.username || !input.password) {
        throw new ValidationError({
          message: `webhooks.${method}: BASIC_AUTHENTICATION requires username + password`,
        });
      }
    } else if (!input.apiKey) {
      throw new ValidationError({
        message: `webhooks.${method}: API_KEY requires apiKey`,
      });
    }
    if (input.subscribedStatuses && input.subscribedStatuses.length === 0) {
      // empty array is fine on Trendyol's side (treated as "all"), so no throw —
      // just a comment for readers.
    }
    // Soft check: surface Trendyol's 15-cap via JSDoc; not pre-checked here
    // because doing so would require an extra round-trip.
    void MAX_WEBHOOKS_PER_SELLER;
  }

  private webhookPath(webhookId: string | number): string {
    return `/integration/sellers/${this.transport.sellerId}/webhooks/${encodeURIComponent(String(webhookId))}`;
  }
}
