import { describe, expect, it, vi } from 'vitest';
import { NotFoundError, paginate, TokenBucketRateLimiter } from '@lonca/core';
import { ClaimsResource } from '../resources/claims.js';
import { QuestionsResource } from '../resources/questions.js';
import { ShippingResource } from '../resources/shipping.js';
import { parseXml, type XmlObject } from '../soap/xml.js';
import { soapDate } from '../soap/values.js';
import type { N11Transport } from '../transport.js';

/**
 * Responses are written as XML and parsed with the SDK's own parser, so the
 * fixtures exercise the same single-vs-repeated element handling as the wire.
 * Element names follow the WSDLs and the doc examples; every value is invented.
 */
function response(inner: string): XmlObject {
  return parseXml(`<R>${inner}</R>`).R as XmlObject;
}

function mockTransport(...responses: XmlObject[]) {
  const soap = vi.fn();
  for (const r of responses) soap.mockResolvedValueOnce(r);
  return { transport: { soap } as unknown as N11Transport, soap };
}

const paging = (current: number, pageCount: number) =>
  `<pagingData><currentPage>${current}</currentPage><pageSize>20</pageSize><totalCount>3</totalCount><pageCount>${pageCount}</pageCount></pagingData>`;

describe('soapDate', () => {
  it('formats a Date as DD/MM/YYYY on the Istanbul calendar day', () => {
    // 22:30 UTC on 31 Dec is already 1 Jan in Istanbul (UTC+3).
    expect(soapDate(new Date('2025-12-31T22:30:00Z'))).toBe('01/01/2026');
    expect(soapDate('11/03/2026')).toBe('11/03/2026');
    expect(soapDate(undefined)).toBeUndefined();
  });
});

describe('QuestionsResource', () => {
  const question = (id: number, answer = '') =>
    `<productQuestion><id>${id}</id><productId>730000001</productId><productTitle>Örnek Fincan</productTitle>` +
    `<questionSubject>Kargo hakkında</questionSubject><question>Nasıl gönderiliyor?</question>` +
    `<answer>${answer}</answer><images><image>https://example.invalid/1.jpg</image><image></image></images></productQuestion>`;

  it('lists with the required window and paging, normalising single and repeated rows', async () => {
    const { transport, soap } = mockTransport(
      response(
        `<result><status>success</status></result><productQuestions>${question(1, 'Bantlı')}</productQuestions>${paging(0, 2)}`,
      ),
      response(`<productQuestions>${question(2)}${question(3)}</productQuestions>${paging(1, 2)}`),
    );
    const resource = new QuestionsResource(transport);

    const first = await resource.list({
      startDate: new Date('2026-03-11T09:00:00Z'),
      endDate: '12/03/2026',
      status: 'CLOSED',
      productId: 730000001,
      limit: 500,
    });

    const call = soap.mock.calls[0]![0];
    expect(call).toMatchObject({ service: 'productService', operation: 'GetProductQuestionList' });
    expect(call.fields).toEqual({
      productQuestionSearch: {
        productId: 730000001,
        buyerEmail: undefined,
        subject: undefined,
        status: 'CLOSED',
        startDate: '11/03/2026',
        endDate: '12/03/2026',
      },
      pagingData: { currentPage: 0, pageSize: 100 },
    });
    expect(call.rateLimiter).toBeInstanceOf(TokenBucketRateLimiter);
    expect(first.nextCursor).toBe('1');
    expect(first.items).toEqual([
      {
        id: '1',
        productId: '730000001',
        productTitle: 'Örnek Fincan',
        subject: 'Kargo hakkında',
        question: 'Nasıl gönderiliyor?',
        answer: 'Bantlı',
        images: ['https://example.invalid/1.jpg'],
        raw: expect.any(Object),
      },
    ]);

    const second = await resource.list({ startDate: 'a', endDate: 'b', cursor: first.nextCursor });
    expect(soap.mock.calls[1]![0].fields.pagingData).toEqual({ currentPage: 1, pageSize: 20 });
    expect(second.items.map((q) => [q.id, q.answer])).toEqual([
      ['2', undefined],
      ['3', undefined],
    ]);
    expect(second.nextCursor).toBeUndefined();
  });

  it('stops on an empty list and pages on when pagingData is absent', async () => {
    const { transport } = mockTransport(
      response(`<productQuestions/>${paging(0, 5)}`),
      response(`<productQuestions>${question(1)}</productQuestions>`),
    );
    const resource = new QuestionsResource(
      transport,
      new TokenBucketRateLimiter({ capacity: 9, intervalMs: 1 }),
    );
    expect(await resource.list({ startDate: 'a', endDate: 'b' })).toEqual({ items: [] });
    expect((await resource.list({ startDate: 'a', endDate: 'b', limit: 0 })).nextCursor).toBe('1');
  });

  it('rejects an invalid cursor', async () => {
    const { transport } = mockTransport();
    await expect(
      new QuestionsResource(transport).list({ startDate: 'a', endDate: 'b', cursor: 'x' }),
    ).rejects.toThrow(TypeError);
  });

  it('gets one question with buyer and status fields', async () => {
    const { transport, soap } = mockTransport(
      response(
        '<productQuestion><productId>730000001</productId><productTitle>Örnek Fincan</productTitle>' +
          '<questionSubject>Kargo</questionSubject><question>Ne zaman?</question><answer>Yarın</answer>' +
          '<fullName>Ada Yılmaz</fullName><email>ada@example.invalid</email><productStatus>Active</productStatus>' +
          '<status>CLOSED</status><questionDate>11/03/2026</questionDate><answeredDate>12/03/2026</answeredDate>' +
          '<sellerExpose>true</sellerExpose><buyerExpose>Genel</buyerExpose><images/></productQuestion>',
      ),
      response(''),
    );
    const resource = new QuestionsResource(transport);
    const detail = await resource.get(114646171);
    expect(soap.mock.calls[0]![0]).toMatchObject({
      operation: 'GetProductQuestionDetail',
      fields: { productQuestionId: '114646171' },
    });
    expect(detail).toMatchObject({
      id: '114646171',
      productId: '730000001',
      subject: 'Kargo',
      answer: 'Yarın',
      fullName: 'Ada Yılmaz',
      email: 'ada@example.invalid',
      status: 'CLOSED',
      questionDate: '11/03/2026',
      answeredDate: '12/03/2026',
      buyerExpose: 'Genel',
      images: [],
    });
    // prod answers an unknown id with result: success and no productQuestion
    await expect(resource.get('9')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('ClaimsResource', () => {
  const claimReturn = (id: number) =>
    `<claimReturn><claimReturnId>${id}</claimReturnId><status>REQUESTED</status><executer>BUYER</executer>` +
    '<returnReasonType>Beden uymadı</returnReasonType><returnReasonDescription>Küçük</returnReasonDescription>' +
    '<orderNumber>200000000001</orderNumber><shipmentMethod>1</shipmentMethod><requestDate>01/10/2026</requestDate>' +
    '<productId>730000001</productId><productName>Örnek Ürün</productName><attributesNames>42</attributesNames>' +
    '<quantity>2</quantity><unitPrice>150.50</unitPrice><finalPrice>301</finalPrice><buyerName>Ada Yılmaz</buyerName>' +
    '<buyerEmail>ada@example.invalid</buyerEmail><buyerPhone>5550000000</buyerPhone><skuId>9000001</skuId>' +
    '<approvalRemainingTime>2 gün</approvalRemainingTime><sender>SELLER</sender><deniedDate/></claimReturn>';

  it('lists returns with filters and normalises rows', async () => {
    const { transport, soap } = mockTransport(
      response(
        `<result><status>success</status></result>${paging(0, 1)}<claimReturnList>${claimReturn(1)}${claimReturn(2)}</claimReturnList>`,
      ),
    );
    const page = await new ClaimsResource(transport).listReturns({
      status: 'ALL',
      executer: 'BUYER',
      searchInfoType: 'ORDERID',
      searchQuery: '200000000001',
      startDate: '01/10/2026',
      endDate: new Date('2026-10-10T12:00:00Z'),
      sender: 'ALL',
    });
    const call = soap.mock.calls[0]![0];
    expect(call).toMatchObject({ service: 'returnService', operation: 'ClaimReturnList' });
    expect(call.fields).toEqual({
      searchData: {
        status: 'ALL',
        executer: 'BUYER',
        searchInfoType: 'ORDERID',
        searchQuery: '200000000001',
        period: { startDate: '01/10/2026', endDate: '10/10/2026' },
        sender: 'ALL',
      },
      pagingData: { currentPage: 0 },
    });
    expect(page.nextCursor).toBeUndefined();
    expect(page.items).toHaveLength(2);
    expect(page.items[0]).toMatchObject({
      id: '1',
      status: 'REQUESTED',
      executer: 'BUYER',
      reasonType: 'Beden uymadı',
      reasonDescription: 'Küçük',
      orderNumber: '200000000001',
      requestDate: '01/10/2026',
      productId: '730000001',
      skuId: '9000001',
      quantity: 2,
      unitPrice: { amount: 15050, currency: 'TRY' },
      finalPrice: { amount: 30100, currency: 'TRY' },
      buyerName: 'Ada Yılmaz',
      sender: 'SELLER',
    });
    expect(page.items[0]!.deniedDate).toBeUndefined();
  });

  it('sends no period without dates and pages through returns', async () => {
    const { transport, soap } = mockTransport(
      response(`${paging(0, 2)}<claimReturnList>${claimReturn(1)}</claimReturnList>`),
      response(`${paging(1, 2)}<claimReturnList>${claimReturn(2)}</claimReturnList>`),
    );
    const resource = new ClaimsResource(transport);
    const ids: string[] = [];
    for await (const claim of paginate((p) => resource.listReturns(p))) ids.push(claim.id);
    expect(ids).toEqual(['1', '2']);
    expect(soap.mock.calls[0]![0].fields.searchData.period).toBeUndefined();
    expect(soap.mock.calls[1]![0].fields.pagingData).toEqual({ currentPage: 1 });
  });

  it('lists cancels with a search-date block only when asked', async () => {
    const cancel =
      '<claimCancel><claimCancelId>5</claimCancelId><status>COMPLETED</status><executer>SYSTEM</executer>' +
      '<cancelReasonType>Stok yok</cancelReasonType><cancelReasonDescription>-</cancelReasonDescription>' +
      '<denyReasonType/><orderNumber>200000000002</orderNumber><requestDate>02/10/2026</requestDate>' +
      '<completedDate>03/10/2026</completedDate><productId>1</productId><skuId>2</skuId>' +
      '<paymentDate>01/10/2026</paymentDate><shipmentCompany>Örnek Kargo</shipmentCompany>' +
      '<deliveryFeeType>1</deliveryFeeType><buyerName>Ada Yılmaz</buyerName>' +
      '<buyerEmail>ada@example.invalid</buyerEmail><buyerPhone>5550000000</buyerPhone>' +
      '<productName>Ürün</productName><quantity>1</quantity><unitPrice>10</unitPrice><finalPrice>10</finalPrice></claimCancel>';
    const { transport, soap } = mockTransport(
      response(`${paging(0, 1)}<claimCancelList>${cancel}</claimCancelList>`),
      response(`${paging(0, 0)}<claimCancelList/>`),
      response(''),
    );
    const resource = new ClaimsResource(transport);
    const page = await resource.listCancels({
      status: 'ALL',
      searchDateType: 'REQUEST',
      startDate: '01/10/2026',
      endDate: '10/10/2026',
    });
    expect(soap.mock.calls[0]![0]).toMatchObject({
      service: 'claimCancelService',
      operation: 'ClaimCancelList',
    });
    expect(soap.mock.calls[0]![0].fields.searchData.searchDate).toEqual({
      searchDateType: 'REQUEST',
      period: { startDate: '01/10/2026', endDate: '10/10/2026' },
    });
    expect(page.items[0]).toMatchObject({
      id: '5',
      status: 'COMPLETED',
      reasonType: 'Stok yok',
      completedDate: '03/10/2026',
      paymentDate: '01/10/2026',
      shipmentCompany: 'Örnek Kargo',
      deliveryFeeType: '1',
      buyerName: 'Ada Yılmaz',
      buyerEmail: 'ada@example.invalid',
      buyerPhone: '5550000000',
      quantity: 1,
      unitPrice: { amount: 1000, currency: 'TRY' },
    });
    expect(page.items[0]!.denyReasonType).toBeUndefined();

    expect(await resource.listCancels({ searchDateType: 'REQUEST' })).toEqual({ items: [] });
    expect(soap.mock.calls[1]![0].fields.searchData.searchDate).toEqual({
      searchDateType: 'REQUEST',
      period: undefined,
    });
    await resource.listCancels();
    expect(soap.mock.calls[2]![0].fields.searchData.searchDate).toBeUndefined();
  });

  it('normalises sparse claim rows', async () => {
    const { transport } = mockTransport(
      response(
        '<claimReturnList><claimReturn><quantity>x</quantity></claimReturn></claimReturnList>',
      ),
      response('<claimCancelList><claimCancel><status/></claimCancel></claimCancelList>'),
    );
    const resource = new ClaimsResource(transport);
    const [ret] = (await resource.listReturns()).items;
    expect(ret).toMatchObject({ id: '', status: '' });
    expect(ret!.quantity).toBeUndefined();
    const [cancel] = (await resource.listCancels()).items;
    expect(cancel).toMatchObject({ id: '', status: '' });
  });

  it('rejects an invalid cursor', async () => {
    const { transport } = mockTransport();
    const resource = new ClaimsResource(transport);
    await expect(resource.listReturns({ cursor: '-1' })).rejects.toThrow(TypeError);
    await expect(resource.listCancels({ cursor: '1.5' })).rejects.toThrow(TypeError);
  });

  it('reads reason lists in the repeated-list form prod sends', async () => {
    const { transport } = mockTransport(
      response(
        '<result><status>success</status></result>' +
          '<denyReasonTypeDataList><id>1</id><value>Kullanılmış</value></denyReasonTypeDataList>' +
          '<denyReasonTypeDataList><id>2</id><value>Eksik</value></denyReasonTypeDataList>',
      ),
      response(
        '<pendingReasonTypeDataList><id>3</id><value>İnceleme</value></pendingReasonTypeDataList>',
      ),
    );
    const resource = new ClaimsResource(transport);
    expect(await resource.getReturnDenyReasons()).toEqual([
      { id: '1', value: 'Kullanılmış' },
      { id: '2', value: 'Eksik' },
    ]);
    expect(await resource.getReturnPendingReasons()).toEqual([{ id: '3', value: 'İnceleme' }]);
  });

  it('reads the three reason-type lists in the WSDL (wrapped) form', async () => {
    const { transport, soap } = mockTransport(
      response(
        '<denyReasonTypeDataList><denyReasonTypeData><id>1</id><value>Kullanılmış</value></denyReasonTypeData>' +
          '<denyReasonTypeData><id>2</id><value>Eksik</value></denyReasonTypeData></denyReasonTypeDataList>',
      ),
      response(
        '<pendingReasonTypeDataList><pendingReasonTypeData><id>3</id><value>İnceleme</value></pendingReasonTypeData></pendingReasonTypeDataList>',
      ),
      response('<denyReasonTypeDataList><denyReasonTypeData/></denyReasonTypeDataList>'),
    );
    const resource = new ClaimsResource(transport);
    expect(await resource.getReturnDenyReasons()).toEqual([
      { id: '1', value: 'Kullanılmış' },
      { id: '2', value: 'Eksik' },
    ]);
    expect(await resource.getReturnPendingReasons()).toEqual([{ id: '3', value: 'İnceleme' }]);
    expect(await resource.getCancelDenyReasons()).toEqual([]);
    expect(soap.mock.calls.map((c) => [c[0].service, c[0].operation])).toEqual([
      ['returnService', 'ClaimReturnDenyReasonTypes'],
      ['returnService', 'ClaimReturnPendingReasonTypes'],
      ['claimCancelService', 'ClaimCancelDenyReasonType'],
    ]);
  });
});

describe('ShippingResource', () => {
  it('lists shipment companies', async () => {
    const { transport, soap } = mockTransport(
      response(
        '<result><status>success</status></result><shipmentCompanies>' +
          '<shipmentCompany><id>344</id><name>Örnek Kargo</name><shortName>ORN</shortName></shipmentCompany>' +
          '<shipmentCompany><id>345</id><name>Diğer Kargo</name><shortName/></shipmentCompany>' +
          '<shipmentCompany/></shipmentCompanies>',
      ),
    );
    expect(await new ShippingResource(transport).getShipmentCompanies()).toEqual([
      { id: '344', name: 'Örnek Kargo', shortName: 'ORN' },
      { id: '345', name: 'Diğer Kargo' },
    ]);
    expect(soap.mock.calls[0]![0]).toEqual({
      service: 'shipmentCompanyService',
      operation: 'GetShipmentCompanies',
    });
  });
});
