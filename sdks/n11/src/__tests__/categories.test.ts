import { describe, expect, it, vi } from 'vitest';
import { CategoriesResource } from '../resources/categories.js';
import type { N11Transport } from '../transport.js';

/** Fixtures follow the shapes prod answered on 2026-10-10; every value is invented. */
function mockTransport(...responses: unknown[]) {
  const request = vi.fn();
  for (const r of responses) request.mockResolvedValueOnce(r);
  return { transport: { request } as unknown as N11Transport, request };
}

describe('CategoriesResource.list', () => {
  it('calls GET /cdn/categories and normalises the tree', async () => {
    const { transport, request } = mockTransport({
      categories: [
        {
          id: 1000001,
          parentId: null,
          name: 'Giyim',
          subCategories: [
            { id: 1000002, parentId: 1000001, name: 'Ayakkabı', subCategories: null },
            { id: 1000003, parentId: 1000001, name: 'Çanta', subCategories: [] },
          ],
        },
      ],
    });

    const tree = await new CategoriesResource(transport).list();

    expect(request).toHaveBeenCalledWith({ method: 'GET', path: '/cdn/categories' });
    expect(tree).toHaveLength(1);
    const root = tree[0]!;
    expect(root).toMatchObject({ id: '1000001', name: 'Giyim', leaf: false });
    expect(root.parentId).toBeUndefined();
    expect(root.raw).toEqual({ id: 1000001, parentId: null, name: 'Giyim' });
    expect(root.subCategories.map((c) => [c.id, c.parentId, c.leaf])).toEqual([
      ['1000002', '1000001', true],
      ['1000003', '1000001', true],
    ]);
  });

  it('returns an empty list for an empty or missing body', async () => {
    const { transport } = mockTransport(undefined, {});
    const resource = new CategoriesResource(transport);
    expect(await resource.list()).toEqual([]);
    expect(await resource.list()).toEqual([]);
  });

  it('tolerates nodes with missing fields', async () => {
    const { transport } = mockTransport({ categories: [{}] });
    const [node] = await new CategoriesResource(transport).list();
    expect(node).toMatchObject({ id: '', name: '', leaf: true, subCategories: [] });
  });
});

describe('CategoriesResource.getAttributes', () => {
  it('calls GET /cdn/category/{id}/attribute and normalises the attributes', async () => {
    const { transport, request } = mockTransport({
      id: 1000002,
      name: 'Ayakkabı',
      categoryAttributes: [
        {
          attributeId: 1,
          categoryId: 1000002,
          attributeName: 'Marka',
          isMandatory: true,
          isVariant: false,
          isSlicer: true,
          isCustomValue: false,
          isN11Grouping: false,
          attributeOrder: 1,
          attributeValues: [{ id: 501, value: 'Örnek Marka' }],
        },
        {
          attributeId: 429,
          attributeName: 'Renk',
          isVariant: true,
          attributeValues: [],
        },
      ],
    });

    const result = await new CategoriesResource(transport).getAttributes(1000002);

    expect(request).toHaveBeenCalledWith({
      method: 'GET',
      path: '/cdn/category/1000002/attribute',
    });
    expect(result.categoryId).toBe('1000002');
    expect(result.name).toBe('Ayakkabı');
    expect(result.attributes[0]).toMatchObject({
      id: '1',
      name: 'Marka',
      isMandatory: true,
      isVariant: false,
      isSlicer: true,
      isCustomValue: false,
      isN11Grouping: false,
      order: 1,
      values: [{ id: '501', value: 'Örnek Marka' }],
    });
    expect(result.attributes[1]).toMatchObject({
      id: '429',
      isMandatory: false,
      isVariant: true,
      values: [],
    });
    expect(result.attributes[1]!.order).toBeUndefined();
  });

  it('falls back to the requested id and tolerates an empty body', async () => {
    const { transport, request } = mockTransport(undefined, {
      categoryAttributes: [{ attributeValues: [{}] }],
    });
    const resource = new CategoriesResource(transport);

    expect(await resource.getAttributes('a/b')).toEqual({
      categoryId: 'a/b',
      name: '',
      attributes: [],
    });
    expect(request.mock.calls[0]![0].path).toBe('/cdn/category/a%2Fb/attribute');

    const second = await resource.getAttributes(7);
    expect(second.attributes[0]).toMatchObject({
      id: '',
      name: '',
      values: [{ id: '', value: '' }],
    });
  });
});
