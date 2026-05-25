import { TokenBucketRateLimiter, ValidationError } from '@lonca/core';
import type { TrendyolTransport } from '../transport.js';
import type {
  DeleteInvoiceLinkInput,
  SendInvoiceLinkInput,
  UploadInvoiceFileInput,
} from '../types/misc.js';

/**
 * Trendyol invoice endpoints — upload PDF/JPEG/PNG invoice files or
 * register/delete invoice links. Pair these with `orders.updatePackageStatus(_, { status: 'Invoiced' })`
 * after invoice issuance.
 */
export class InvoicesResource {
  private readonly limiter: TokenBucketRateLimiter;

  constructor(
    private readonly transport: TrendyolTransport,
    private readonly sellerId: number,
    limiter?: TokenBucketRateLimiter,
  ) {
    this.limiter = limiter ?? new TokenBucketRateLimiter({ capacity: 500, intervalMs: 60_000 });
  }

  /**
   * Upload an invoice file for a shipment package. **Multipart**: the
   * SDK builds the FormData internally from the typed input.
   *
   * Max 10 MB. Accepted formats: PDF, JPEG, PNG.
   */
  async uploadFile(input: UploadInvoiceFileInput): Promise<unknown> {
    if (!input?.file) {
      throw new ValidationError({ message: 'invoices.uploadFile: file is required' });
    }
    if (!input.shipmentPackageId) {
      throw new ValidationError({ message: 'invoices.uploadFile: shipmentPackageId is required' });
    }
    const form = new FormData();
    form.append('shipmentPackageId', String(input.shipmentPackageId));
    form.append('file', input.file);
    if (input.invoiceDateTime !== undefined) {
      form.append('invoiceDateTime', String(input.invoiceDateTime));
    }
    if (input.invoiceNumber !== undefined) {
      form.append('invoiceNumber', input.invoiceNumber);
    }
    return this.transport.request<unknown>({
      method: 'POST',
      path: `/integration/sellers/${this.sellerId}/seller-invoice-file`,
      body: form,
      rateLimiter: this.limiter,
    });
  }

  /** Register an invoice URL with Trendyol (alternative to uploading the file). */
  async sendLink(input: SendInvoiceLinkInput): Promise<unknown> {
    if (!input?.invoiceLink) {
      throw new ValidationError({ message: 'invoices.sendLink: invoiceLink is required' });
    }
    return this.transport.request<unknown>({
      method: 'POST',
      path: `/integration/sellers/${this.sellerId}/seller-invoice-links`,
      body: input,
      rateLimiter: this.limiter,
    });
  }

  /** Remove a previously-registered invoice link. */
  async deleteLink(input: DeleteInvoiceLinkInput): Promise<unknown> {
    return this.transport.request<unknown>({
      method: 'POST',
      path: `/integration/sellers/${this.sellerId}/seller-invoice-links/delete`,
      body: input,
      rateLimiter: this.limiter,
    });
  }
}
