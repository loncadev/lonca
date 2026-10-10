// Research skeleton — private, unpublished; read resources verified on prod. See RESEARCH.md.
export { createN11Client, type CreateN11ClientOptions, type N11Client } from './client.js';
export { N11Transport, type N11Environment } from './transport.js';
export { mapHttpError } from './errors.js';
export { n11Capabilities, type N11Capabilities } from './capabilities.js';
export { CategoriesResource } from './resources/categories.js';
export { OrdersResource } from './resources/orders.js';
export { ProductsResource } from './resources/products.js';
export type {
  N11AttributeValue,
  N11Category,
  N11CategoryAttribute,
  N11CategoryAttributes,
} from './types/category.js';
export type {
  ListN11OrdersParams,
  N11Address,
  N11OrderLine,
  N11PackageHistory,
  N11PackageStatus,
  N11ShipmentPackage,
} from './types/order.js';
export type {
  ListN11ProductsParams,
  N11Product,
  N11ProductAttribute,
  N11ProductStatus,
  N11SaleStatus,
  N11Sender,
} from './types/product.js';
