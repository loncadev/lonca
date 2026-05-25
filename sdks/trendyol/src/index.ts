export { createTrendyolClient, type CreateClientOptions, type TrendyolClient } from './client.js';
export { type TrendyolEnvironment } from './transport.js';
export { BrandsResource } from './resources/brands.js';
export { CategoriesResource } from './resources/categories.js';
export { InventoryResource } from './resources/inventory.js';
export { OrdersResource, type ListOrdersParams } from './resources/orders.js';
export { ProductsResource, type ListProductsParams } from './resources/products.js';
export { SuppliersResource, type SuppliersResourceOptions } from './resources/suppliers.js';
export type { Brand } from './types/brand.js';
export type { Category, CategoryAttribute, CategoryAttributeValue } from './types/category.js';
export type { PriceInventoryUpdate, UpdatePriceInventoryResponse } from './types/inventory.js';
export type {
  OrderAddress,
  OrderAddressLines,
  OrderCustomer,
  OrderLine,
  OrderLineDiscountDetail,
  PackageHistoryEntry,
  ShipmentPackage,
  ShipmentPackageStatus,
} from './types/order.js';
export type {
  BatchRequestItemResult,
  BatchRequestResult,
  BatchRequestStatus,
  NamedRef,
  Product,
  ProductAttribute,
  ProductVariant,
} from './types/product.js';
export type { SupplierAddress, SupplierAddressType } from './types/supplier-address.js';
