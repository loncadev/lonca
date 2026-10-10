import { describe, expect, it } from 'vitest';
import {
  asArray,
  asObject,
  asText,
  escapeXml,
  parseXml,
  toXml,
  XmlParseError,
} from '../soap/xml.js';

describe('parseXml', () => {
  it('strips namespace prefixes and nests children by local name', () => {
    const doc = parseXml(
      '<?xml version="1.0" encoding="UTF-8"?>' +
        '<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">' +
        '<SOAP-ENV:Body><ns3:XResponse xmlns:ns3="http://www.n11.com/ws/schemas">' +
        '<result><status>success</status></result>' +
        '</ns3:XResponse></SOAP-ENV:Body></SOAP-ENV:Envelope>',
    );
    expect(doc).toEqual({
      Envelope: { Body: { XResponse: { result: { status: 'success' } } } },
    });
  });

  it('turns repeated siblings into arrays and keeps single ones as values', () => {
    const doc = parseXml('<l><i>a</i><i>b</i><i>c</i><one>x</one></l>');
    expect(doc).toEqual({ l: { i: ['a', 'b', 'c'], one: 'x' } });
  });

  it('decodes entities and CDATA, keeps leaf whitespace', () => {
    const doc = parseXml(
      '<r><a>Fiyat &lt; 10 &amp; &quot;iyi&quot; &apos;x&apos; &#252;&#x131;</a>' +
        '<b><![CDATA[<b>&amp;</b>]]></b><c> boşluk </c><d>&unknown;</d></r>',
    );
    expect(doc.r).toEqual({
      a: 'Fiyat < 10 & "iyi" \'x\' üı',
      b: '<b>&amp;</b>',
      c: ' boşluk ',
      d: '&unknown;',
    });
  });

  it('maps empty and self-closing elements to "" and xsi:nil to null', () => {
    const doc = parseXml(
      '<r xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><a/><b></b>' +
        '<c xsi:nil="true"/><d xsi:nil="true"></d><e attr="a>b">v</e></r>',
    );
    expect(doc.r).toEqual({ a: '', b: '', c: null, d: null, e: 'v' });
  });

  it('skips comments', () => {
    expect(parseXml('<r><!-- not data --><a>1</a></r>')).toEqual({ r: { a: '1' } });
  });

  it.each([
    ['a DTD', '<!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/passwd">]><r>&x;</r>'],
    ['a processing instruction', '<?php echo 1 ?><r/>'],
    ['a mismatched closing tag', '<a><b></a>'],
    ['an unclosed element', '<a><b></b>'],
    ['a stray closing tag', '</a>'],
    ['an unterminated tag', '<a'],
    ['an unterminated closing tag', '<a></a'],
    ['an unterminated comment', '<a><!-- x'],
    ['an unterminated CDATA section', '<a><![CDATA[x'],
    ['an unterminated declaration', '<?xml version="1.0"'],
    ['a malformed tag', '< >'],
  ])('rejects %s', (_label, xml) => {
    expect(() => parseXml(xml)).toThrow(XmlParseError);
  });

  it('collects trailing text without failing', () => {
    expect(parseXml('<a>1</a> trailing')).toEqual({ a: '1' });
  });
});

describe('xml helpers', () => {
  it('asArray normalises absent, empty, single and repeated values', () => {
    expect(asArray(undefined)).toEqual([]);
    expect(asArray(null)).toEqual([]);
    expect(asArray('')).toEqual([]);
    expect(asArray('x')).toEqual(['x']);
    expect(asArray(['x', 'y'])).toEqual(['x', 'y']);
    expect(asArray(['x', '', null, { a: '1' }])).toEqual(['x', { a: '1' }]);
  });

  it('asObject and asText only accept their own kind', () => {
    expect(asObject({ a: '1' })).toEqual({ a: '1' });
    expect(asObject('x')).toEqual({});
    expect(asObject(['x'])).toEqual({});
    expect(asObject(undefined)).toEqual({});
    expect(asText('x')).toBe('x');
    expect(asText('')).toBeUndefined();
    expect(asText({})).toBeUndefined();
  });

  it('escapeXml escapes the five XML specials', () => {
    expect(escapeXml(`<a href="x">&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;',
    );
  });

  it('toXml serialises in key order, skips null/undefined, repeats arrays, escapes text', () => {
    expect(
      toXml({
        auth: { appKey: 'k&1', appSecret: 's<2' },
        skipped: undefined,
        nothing: null,
        id: 7,
        flag: false,
        tag: ['a', 'b'],
      }),
    ).toBe(
      '<auth><appKey>k&amp;1</appKey><appSecret>s&lt;2</appSecret></auth><id>7</id><flag>false</flag><tag>a</tag><tag>b</tag>',
    );
  });

  it('round-trips toXml through parseXml', () => {
    const xml = `<r>${toXml({ a: 'Ç & ş', b: { c: '1' } })}</r>`;
    expect(parseXml(xml)).toEqual({ r: { a: 'Ç & ş', b: { c: '1' } } });
  });
});
