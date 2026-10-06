// Модульные тесты разбора JSON-LD: блоки, @graph, типы, относительные адреса, сравнение названий.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { brandJsonLd, brandNorm, jsonLdHasRelativeUrl, jsonLdTypeList, parseJsonLdBlocks } from '../src/core/html.ts';

const organization = JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'Organization', name: 'Example', url: 'https://example.com/' },
    { '@type': ['WebSite', 'CreativeWork'], url: 'https://example.com/' },
  ],
});

test('parseJsonLdBlocks: разобранные блоки и ошибки синтаксиса отдельно', () => {
  const { blocks, errors } = parseJsonLdBlocks([organization, '{"@type": "Article",}']);
  assert.equal(blocks.length, 1);
  assert.equal(errors.length, 1);
});

test('parseJsonLdBlocks понимает HTML-сущности в тексте скрипта', () => {
  const { blocks } = parseJsonLdBlocks(['{&quot;@type&quot;: &quot;Thing&quot;, &quot;name&quot;: &quot;A &amp; B&quot;}']);
  assert.deepEqual(blocks, [{ '@type': 'Thing', name: 'A & B' }]);
});

test('jsonLdTypeList: типы из @graph и массивов @type по порядку', () => {
  const { blocks } = parseJsonLdBlocks([organization]);
  assert.deepEqual(jsonLdTypeList(blocks), ['Organization', 'WebSite', 'CreativeWork']);
});

test('brandJsonLd разворачивает @graph и пропускает битые блоки', () => {
  const nodes = brandJsonLd([organization, 'не JSON']);
  assert.deepEqual(
    nodes.map((node) => node['@type']),
    [undefined, 'Organization', ['WebSite', 'CreativeWork']],
  );
});

test('jsonLdHasRelativeUrl находит относительный logo и не трогает якоря', () => {
  assert.equal(jsonLdHasRelativeUrl([{ '@type': 'Organization', logo: '/logo.png' }]), true);
  assert.equal(jsonLdHasRelativeUrl([{ '@type': 'WebPage', mainEntityOfPage: '#main', url: 'https://example.com/' }]), false);
  assert.equal(jsonLdHasRelativeUrl([{ '@graph': [{ sameAs: ['https://t.me/example', 'instagram.com/example'] }] }]), true);
});

test('brandNorm: регистр, диакритика, пробелы и знаки не важны', () => {
  assert.equal(brandNorm('HITZ Agency'), brandNorm('hitz-agency'));
  assert.equal(brandNorm('Café Ñandú'), 'cafenandu');
  assert.equal(brandNorm('<b>Бренд</b> &amp; Ко'), 'брендко');
});
