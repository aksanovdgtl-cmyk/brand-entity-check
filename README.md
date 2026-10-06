# Brand Entity Check

**Проверка сущности бренда** · [English](#english) · [Русский](#русский)

[![test](https://github.com/aksanovdgtl-cmyk/brand-entity-check/actions/workflows/test.yml/badge.svg)](https://github.com/aksanovdgtl-cmyk/brand-entity-check/actions/workflows/test.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-22f360.svg)](LICENSE) [![Live tool](https://img.shields.io/badge/live-hitz.agency-232323.svg)](https://hitz.agency/en/tools/brand-entity)

## English

Check how consistently a brand is represented as an entity for search engines and AI systems. Enter a brand name and a website: the tool reads the home page and its Organization markup, checks 18 signals (name, domain, organization type, contacts, `sameAs` profiles) and looks the brand up in Wikidata. The result is a 0-100 score in six groups with the evidence it found.

- **Live tool:** [hitz.agency/en/tools/brand-entity](https://hitz.agency/en/tools/brand-entity) (Russian: [hitz.agency/tools/brand-entity](https://hitz.agency/tools/brand-entity))
- **This repository:** the same page and the same server check that run on hitz.agency, ready to self-host on Cloudflare Workers.

### Why entity signals matter

Search engines and AI assistants connect mentions of a company into one entity: the site, the Organization markup, official profiles, directories and knowledge bases such as Wikidata. When the name, domain and contacts match everywhere, the brand is easier to recognize, describe correctly and cite. When they differ, AI answers mix the brand up with others or skip it.

### The 18 signals

| Signal | Points |
|---|---|
| The home page responds | 10 |
| HTTPS is used | 4 |
| Canonical points to the main domain | 6 |
| The brand is in `<title>` | 8 |
| The brand is in the H1 | 6 |
| `og:site_name` matches the brand | 5 |
| A meta description of 60+ characters | 3 |
| Organization, Corporation, LocalBusiness, ProfessionalService or Agency markup | 12 |
| `name`, `alternateName` or `legalName` in the markup matches the brand | 8 |
| `url` or `@id` in the markup is on the same domain | 6 |
| A logo or image in the markup | 5 |
| `sameAs` is present | 7 |
| At least 2 social profiles in `sameAs` (Instagram, Facebook, LinkedIn, YouTube, Telegram, Threads, X, VK) | 4 |
| An email (`mailto:` link or `email` in the markup) | 3 |
| A phone (`tel:` link or `telephone` in the markup) | 3 |
| `contactPoint` in the markup | 3 |
| `address` in the markup | 3 |
| The brand is found in Wikidata (exact label match) | 4 |

Total: 100 points. Names are compared after normalization: case, diacritics, spaces and punctuation are ignored. The signals also roll up into six groups (name, domain, organization, contacts, profiles, markup). Result: 80+ is a well-connected entity, 55-79 partly assembled, below 55 weak.

### API

```http
GET /api/tools/brand-entity?url=https://example.com&brand=Example
```

```json
{
  "brand": "Example",
  "checkedUrl": "https://example.com/",
  "score": 87,
  "found": 15,
  "total": 18,
  "title": "Сущность хорошо связана",
  "copy": "Основные сигналы бренда согласованы. Усильте внешние подтверждения и поддерживайте разметку.",
  "checks": [
    { "label": "Название", "score": 78, "state": "сильный сигнал", "copy": "Название бренда согласовано с основными элементами страницы." }
  ],
  "signals": [
    { "label": "Сайт отвечает", "passed": true, "weight": 10 }
  ],
  "evidence": {
    "title": "Example - ...",
    "h1": "Example",
    "canonical": "https://example.com/",
    "organizationTypes": ["Organization"],
    "sameAs": ["https://www.linkedin.com/company/example"],
    "socialProfiles": ["https://www.linkedin.com/company/example"],
    "wikidataFound": false
  }
}
```

Any path in `url` is replaced with the home page. `brand` is required (2-120 characters). Texts are in Russian, as on hitz.agency; the English page translates them in the browser. Add `lang=en` for English error messages.

| Status | When |
|---|---|
| 400 | no `url` or `brand`; not http(s); login or password in the URL; non-standard port; IP address, localhost or a host that resolves to a private network |
| 403 | browser request from another origin |
| 429 | more than 10 requests per minute from one IP, or 300 in total |
| 502 | the home page returned an error code, is not HTML, is empty, timed out (5 seconds) or redirected too many times |

### Limits and safety

The first 96 KB of the home page HTML and up to 384,000 characters of JSON-LD are analyzed, streamed through HTMLRewriter. The Wikidata lookup uses the public `wbsearchentities` API with a 5-second timeout; if Wikidata does not answer, the signal is counted as not found. Only public websites are fetched: before every request, including up to 3 redirects, the hostname is resolved through DNS over HTTPS and rejected if it points to a private, loopback, link-local or reserved address.

### Related guides (in Russian)

- [Сущность бренда в поиске: sameAs, Wikidata, граф знаний](https://hitz.agency/blog/sushchnost-brenda-sameas)
- [Нейросеть говорит неправду о компании: как исправить](https://hitz.agency/blog/neyroset-govorit-nepravdu)

### Run locally

Requires Node.js 22.18 or newer.

```sh
npm install
npm run dev
```

Open http://localhost:8787 for the Russian interface or http://localhost:8787/en/ for English. The page calls the API on the same origin: `GET /api/tools/brand-entity`.

### Deploy to Cloudflare Workers

```sh
npx wrangler login
npm run deploy
```

One Worker serves `public/` as static assets and answers `/api/tools/brand-entity`. The free Workers plan is enough. HTML is parsed with [HTMLRewriter](https://developers.cloudflare.com/workers/runtime-apis/html-rewriter/), which is built into the Workers runtime.

### Tests

`npm test` runs unit tests and API tests. API tests build the Worker with Wrangler and run it in Miniflare, the local Cloudflare runtime. DNS lookups and site responses come from fixtures, so no request leaves your machine. `npm run check` type-checks the TypeScript.

### Project structure

```text
public/              page (Russian at /, English at /en/), styles, scripts, fonts
src/worker.ts        Worker entry: /api/* goes to the API, everything else to static assets
src/api.ts           route, Origin check, rate limit, error messages
src/core/            the checks themselves (net.ts, html.ts, brand.ts)
test/                unit tests and API tests in Miniflare
provenance.json      where each file comes from on hitz.agency, with checksums
CITATION.cff         citation metadata
```

### More free GEO tools by HITZ

| Tool | Live version | Source |
|---|---|---|
| AI Crawler Access Checker | [hitz.agency/en/tools/ai-crawler-check](https://hitz.agency/en/tools/ai-crawler-check) | [ai-crawler-check](https://github.com/aksanovdgtl-cmyk/ai-crawler-check) |
| llms.txt Checker and Generator | [hitz.agency/en/tools/llms-txt](https://hitz.agency/en/tools/llms-txt) | [llms-txt-generator](https://github.com/aksanovdgtl-cmyk/llms-txt-generator) |
| Prompt Map Generator | [hitz.agency/en/tools/prompt-map](https://hitz.agency/en/tools/prompt-map) | [geo-prompt-map](https://github.com/aksanovdgtl-cmyk/geo-prompt-map) |
| GEO Page Audit | [hitz.agency/en/tools/geo-audit](https://hitz.agency/en/tools/geo-audit) | [geo-audit](https://github.com/aksanovdgtl-cmyk/geo-audit) |
| Schema / JSON-LD Checker | [hitz.agency/en/tools/schema-check](https://hitz.agency/en/tools/schema-check) | [jsonld-schema-check](https://github.com/aksanovdgtl-cmyk/jsonld-schema-check) |

Catalog with guides: [hitz-geo-tools](https://github.com/aksanovdgtl-cmyk/hitz-geo-tools) · [hitz.agency/en/tools](https://hitz.agency/en/tools)

### How to cite

Use **Cite this repository** on GitHub ([CITATION.cff](CITATION.cff)) or:

> HITZ. Brand Entity Check. https://hitz.agency/en/tools/brand-entity

A link to the live tool is appreciated when you mention it in an article or a talk. The MIT license only requires keeping the copyright notice in copies of the code.

### About HITZ

[HITZ](https://hitz.agency/en) is a GEO agency based in Almaty and Tashkent. We help brands get mentioned and cited in answers from ChatGPT, Gemini, Perplexity, Claude, Google AI Overviews and Yandex Alice. This tool is part of our free [GEO toolkit](https://hitz.agency/en/tools).

### License

[MIT](LICENSE) © 2026 HITZ. The fonts in `public/assets/fonts` are under the SIL Open Font License 1.1. The HITZ name and logo are not covered by the MIT license.

---

## Русский

Проверка того, насколько связно бренд представлен как сущность для поиска и нейросетей. Укажите название бренда и сайт: инструмент прочитает главную страницу и разметку Organization, проверит 18 сигналов (название, домен, тип организации, контакты, профили в `sameAs`) и поищет бренд в Wikidata. Результат: балл от 0 до 100 по шести группам и найденные доказательства.

- **Онлайн-версия:** [hitz.agency/tools/brand-entity](https://hitz.agency/tools/brand-entity) (английская: [hitz.agency/en/tools/brand-entity](https://hitz.agency/en/tools/brand-entity))
- **Этот репозиторий:** та же страница и та же серверная проверка, что работают на hitz.agency. Можно развернуть у себя в Cloudflare Workers.

### Зачем это проверять

Поиск и AI-ассистенты собирают упоминания компании в одну сущность: сайт, разметку Organization, официальные профили, каталоги и базы знаний вроде Wikidata. Когда название, домен и контакты везде совпадают, бренд проще узнать, правильно описать и процитировать. Когда расходятся, нейросети путают бренд с другими или не упоминают вовсе.

### 18 сигналов

| Сигнал | Баллы |
|---|---|
| Главная страница отвечает | 10 |
| Используется HTTPS | 4 |
| Canonical ведет на основной домен | 6 |
| Бренд указан в `<title>` | 8 |
| Бренд указан в H1 | 6 |
| `og:site_name` совпадает с брендом | 5 |
| Meta description от 60 символов | 3 |
| Разметка Organization, Corporation, LocalBusiness, ProfessionalService или Agency | 12 |
| `name`, `alternateName` или `legalName` в разметке совпадает с брендом | 8 |
| `url` или `@id` в разметке на том же домене | 6 |
| Логотип или изображение в разметке | 5 |
| Есть `sameAs` | 7 |
| В `sameAs` минимум 2 соцсети (Instagram, Facebook, LinkedIn, YouTube, Telegram, Threads, X, VK) | 4 |
| Почта (ссылка `mailto:` или `email` в разметке) | 3 |
| Телефон (ссылка `tel:` или `telephone` в разметке) | 3 |
| `contactPoint` в разметке | 3 |
| `address` в разметке | 3 |
| Бренд найден в Wikidata (точное совпадение названия) | 4 |

Всего 100 баллов. Названия сравниваются после нормализации: регистр, диакритика, пробелы и знаки не учитываются. Сигналы также сводятся в шесть групп: название, домен, организация, контакты, профили, разметка. Итог: от 80 «Сущность хорошо связана», 55-79 «Сущность собрана частично», ниже 55 «Сущность выражена слабо».

### API

```http
GET /api/tools/brand-entity?url=https://example.com&brand=Example
```

Ответ: бренд, проверенный адрес, балл, число найденных сигналов из 18, вывод, группы `checks`, все сигналы `signals` с весами и доказательства `evidence` (title, H1, canonical, типы организации, `sameAs`, соцсети, найден ли бренд в Wikidata). Пример в английском разделе. Путь в `url` заменяется на главную. Параметр `brand` обязателен (2-120 символов). С параметром `lang=en` ошибки приходят по-английски.

| Код | Когда |
|---|---|
| 400 | нет `url` или `brand`; не http(s); логин или пароль в адресе; нестандартный порт; IP-адрес, localhost или имя, которое указывает во внутреннюю сеть |
| 403 | запрос браузера с чужого домена |
| 429 | больше 10 запросов в минуту с одного IP или 300 на всех |
| 502 | главная ответила кодом ошибки, это не HTML, она пустая, не ответила за 5 секунд или перенаправлений слишком много |

### Лимиты и безопасность

Разбираются первые 96 КБ HTML главной и до 384 000 символов JSON-LD, потоком через HTMLRewriter. Поиск в Wikidata идет через открытый API `wbsearchentities` с ожиданием до 5 секунд; если Wikidata не ответила, сигнал считается не найденным. Загружаются только публичные сайты: перед каждым запросом, включая до 3 перенаправлений, имя сайта проверяется через DNS over HTTPS, частные, локальные, служебные и зарезервированные адреса отклоняются.

### Разборы по теме

- [Сущность бренда в поиске: sameAs, Wikidata, граф знаний](https://hitz.agency/blog/sushchnost-brenda-sameas)
- [Нейросеть говорит неправду о компании: как исправить](https://hitz.agency/blog/neyroset-govorit-nepravdu)

### Запуск

Нужен Node.js 22.18 или новее.

```sh
npm install
npm run dev
```

Откройте http://localhost:8787 (русский интерфейс) или http://localhost:8787/en/ (английский). Страница обращается к API на своем домене: `GET /api/tools/brand-entity`.

### Публикация в Cloudflare Workers

```sh
npx wrangler login
npm run deploy
```

Один Worker отдает статику из `public/` и отвечает на `/api/tools/brand-entity`. Бесплатного тарифа Workers достаточно. HTML разбирается через [HTMLRewriter](https://developers.cloudflare.com/workers/runtime-apis/html-rewriter/), он встроен в среду Workers.

### Проверки

`npm test` запускает модульные тесты и тесты API. Для тестов API Worker собирается Wrangler и работает в Miniflare, локальной среде Cloudflare. DNS и ответы сайтов подставляются из фикстур: запросы в интернет не уходят. `npm run check` проверяет типы TypeScript.

### Структура

```text
public/              страница (русская на /, английская на /en/), стили, скрипты, шрифты
src/worker.ts        вход Worker: /api/* в API, остальное в статику
src/api.ts           маршрут, проверка Origin, лимит запросов, тексты ошибок
src/core/            сами проверки (net.ts, html.ts, brand.ts)
test/                модульные тесты и тесты API в Miniflare
provenance.json      откуда взят каждый файл на hitz.agency, контрольные суммы
CITATION.cff         данные для цитирования
```

### Другие бесплатные инструменты HITZ

| Инструмент | Онлайн | Исходный код |
|---|---|---|
| Проверка доступа AI-краулеров | [hitz.agency/tools/ai-crawler-check](https://hitz.agency/tools/ai-crawler-check) | [ai-crawler-check](https://github.com/aksanovdgtl-cmyk/ai-crawler-check) |
| Проверка и генератор llms.txt | [hitz.agency/tools/llms-txt](https://hitz.agency/tools/llms-txt) | [llms-txt-generator](https://github.com/aksanovdgtl-cmyk/llms-txt-generator) |
| Генератор карты промтов | [hitz.agency/tools/prompt-map](https://hitz.agency/tools/prompt-map) | [geo-prompt-map](https://github.com/aksanovdgtl-cmyk/geo-prompt-map) |
| GEO-аудит страницы | [hitz.agency/tools/geo-audit](https://hitz.agency/tools/geo-audit) | [geo-audit](https://github.com/aksanovdgtl-cmyk/geo-audit) |
| Проверка и генератор Schema / JSON-LD | [hitz.agency/tools/schema-check](https://hitz.agency/tools/schema-check) | [jsonld-schema-check](https://github.com/aksanovdgtl-cmyk/jsonld-schema-check) |

Каталог с разборами: [hitz-geo-tools](https://github.com/aksanovdgtl-cmyk/hitz-geo-tools) · [hitz.agency/tools](https://hitz.agency/tools)

### Как сослаться

Кнопка GitHub **Cite this repository** ([CITATION.cff](CITATION.cff)) или строка:

> HITZ. Проверка сущности бренда. https://hitz.agency/tools/brand-entity

Если упоминаете инструмент в статье или докладе, будем рады ссылке на онлайн-версию. Лицензия MIT требует только сохранить уведомление об авторстве в копиях кода.

### О HITZ

[HITZ](https://hitz.agency/) - GEO-агентство из Алматы и Ташкента. Помогаем брендам попадать в ответы ChatGPT, Gemini, Perplexity, Claude, Google AI Overviews и Алисы. Инструмент входит в набор [бесплатных GEO-инструментов](https://hitz.agency/tools).

### Лицензия

[MIT](LICENSE) © 2026 HITZ. Шрифты в `public/assets/fonts` распространяются по SIL Open Font License 1.1. Название и логотип HITZ под лицензию MIT не подпадают.
