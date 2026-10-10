// Research skeleton — private, unpublished, unverified. See RESEARCH.md.
export { createN11Client, type CreateN11ClientOptions, type N11Client } from './client.js';
export { N11Transport, type N11Environment } from './transport.js';
export { mapHttpError } from './errors.js';
export { n11Capabilities, type N11Capabilities } from './capabilities.js';
export { ProductsResource } from './resources/products.js';
export type {
  ListN11ProductsParams,
  N11Product,
  N11ProductAttribute,
  N11ProductStatus,
  N11SaleStatus,
  N11Sender,
} from './types/product.js';
