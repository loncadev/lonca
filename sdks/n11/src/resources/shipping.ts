import type { N11Transport } from '../transport.js';
import { asArray, asObject } from '../soap/xml.js';
import { text } from '../soap/values.js';

/** A cargo company n11 works with (`ShipmentCompanyData`). */
export interface N11ShipmentCompany {
  id: string;
  name: string;
  shortName?: string;
}

/**
 * Shipping reference data (SOAP `ShipmentCompanyService`).
 *
 * Source: `api.n11.com/ws/ShipmentCompanyService.wsdl` (the new portal has no
 * page for it; the order docs refer to `GetShipmentCompanies`). Verified
 * against prod on 2026-10-10.
 */
export class ShippingResource {
  constructor(private readonly transport: N11Transport) {}

  /** Cargo companies (`GetShipmentCompanies`); their ids match `shipmentCompanyId` on packages. */
  async getShipmentCompanies(): Promise<N11ShipmentCompany[]> {
    const response = await this.transport.soap({
      service: 'shipmentCompanyService',
      operation: 'GetShipmentCompanies',
    });
    return asArray(asObject(response.shipmentCompanies).shipmentCompany).map((node) => {
      const c = asObject(node);
      const company: N11ShipmentCompany = { id: text(c.id) ?? '', name: text(c.name) ?? '' };
      const shortName = text(c.shortName);
      if (shortName) company.shortName = shortName;
      return company;
    });
  }
}
