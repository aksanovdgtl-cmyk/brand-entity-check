// Тесты API в Miniflare: GET /api/tools/brand-entity?url=...&brand=... с подставной главной и Wikidata.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { html, startWorker } from './helpers/worker.mjs';

const HOME = `<!doctype html>
<html lang="ru">
<head>
  <title>Example Agency - GEO-продвижение</title>
  <meta name="description" content="Example Agency помогает компаниям попадать в ответы ChatGPT, Gemini и Perplexity с 2024 года.">
  <meta property="og:site_name" content="Example Agency">
  <link rel="canonical" href="https://example.com/">
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Example Agency",
    "url":"https://example.com/","logo":"https://example.com/logo.png","telephone":"+7 700 000 00 00",
    "address":{"@type":"PostalAddress","addressLocality":"Алматы"},
    "contactPoint":{"@type":"ContactPoint","contactType":"sales","email":"hello@example.com"},
    "sameAs":["https://www.linkedin.com/company/example","https://www.instagram.com/example","https://www.wikidata.org/wiki/Q1"]}</script>
</head>
<body>
  <h1>Example Agency</h1>
  <a href="mailto:hello@example.com">hello@example.com</a>
</body>
</html>`;

// Тот же адрес поиска, что строит src/core/brand.ts
const wikidataUrl = (brand) => {
  const api = new URL('https://www.wikidata.org/w/api.php');
  for (const [key, value] of Object.entries({ action: 'wbsearchentities', search: brand, language: 'ru', uselang: 'ru', limit: '8', format: 'json', origin: '*' })) {
    api.searchParams.set(key, value);
  }
  return api.href;
};

let worker;

before(async () => {
  worker = await startWorker({
    sites: {
      'https://example.com/': () => html(HOME),
      'https://bare.example/': () => html('<html><head><title>Сайт</title></head><body><h1>Добро пожаловать</h1></body></html>'),
      [wikidataUrl('Example Agency')]: () => Response.json({ search: [{ label: 'Example Agency' }] }),
    },
  });
});

after(() => worker.dispose());

const check = async (url, brand) => {
  const params = new URLSearchParams({ url, ...(brand === undefined ? {} : { brand }) });
  const response = await worker.fetch(`/api/tools/brand-entity?${params}`);
  return { status: response.status, body: await response.json() };
};

test('главная со всеми сигналами и бренд в Wikidata: 18 из 18, 100 баллов', async () => {
  const { status, body } = await check('https://example.com/about?utm=1', 'Example Agency');
  assert.equal(status, 200);
  assert.equal(body.checkedUrl, 'https://example.com/');
  assert.equal(body.total, 18);
  assert.equal(body.found, 18);
  assert.equal(body.score, 100);
  assert.equal(body.title, 'Сущность хорошо связана');
  assert.equal(body.evidence.wikidataFound, true);
  assert.deepEqual(body.evidence.socialProfiles, ['https://www.linkedin.com/company/example', 'https://www.instagram.com/example']);
});

test('бренд не найден в Wikidata - минус 4 балла', async () => {
  const { body } = await check('https://example.com/', 'Example');
  assert.equal(body.evidence.wikidataFound, false);
  assert.deepEqual(
    body.signals.filter((s) => !s.passed).map((s) => s.label),
    ['Бренд найден в Wikidata'],
  );
  assert.equal(body.score, 96);
});

test('сайт без разметки - сущность выражена слабо', async () => {
  const { body } = await check('https://bare.example/', 'Example Agency');
  assert.ok(body.score < 55, `score ${body.score}`);
  assert.equal(body.title, 'Сущность выражена слабо');
  assert.equal(body.checks.find((c) => c.label === 'Разметка').state, 'приоритет');
});

test('без названия бренда - 400', async () => {
  assert.deepEqual(await check('https://example.com/'), { status: 400, body: { error: 'Укажите название бренда' } });
  assert.deepEqual(await check('https://example.com/', 'x'), { status: 400, body: { error: 'Укажите название бренда' } });
});
