// Проверка сущности бренда: 18 сигналов главной страницы, разметки и Wikidata.
// Источник: сервер инструментов hitz.agency (https://hitz.agency/tools).
import { brandJsonLd, brandNorm, documentLink, documentMeta, readHtmlDocument, type HtmlDocument, type JsonLdNode } from './html.ts';
import { assertPublicWebsiteUrl, fetchBrandPage } from './net.ts';

interface WikidataSearch {
  search?: Array<{ label?: string }>;
}

async function findBrandInWikidata(brand: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const api = new URL('https://www.wikidata.org/w/api.php');
    api.searchParams.set('action', 'wbsearchentities');
    api.searchParams.set('search', brand);
    api.searchParams.set('language', 'ru');
    api.searchParams.set('uselang', 'ru');
    api.searchParams.set('limit', '8');
    api.searchParams.set('format', 'json');
    api.searchParams.set('origin', '*');
    const response = await fetch(api.href, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return false;
    const data = (await response.json()) as WikidataSearch;
    const expected = brandNorm(brand);
    return Array.isArray(data.search) && data.search.some((item) => brandNorm(item.label) === expected);
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function brandCategory(label: string, earned: number, total: number, positive: string, negative: string, strongAt = 80) {
  const score = total ? Math.round((earned / total) * 100) : 0;
  return {
    label,
    score,
    state: score >= strongAt ? 'сильный сигнал' : score >= 55 ? 'нужно усилить' : 'приоритет',
    copy: score >= strongAt ? positive : negative,
  };
}

/** Значения поля узла как массив (sameAs бывает строкой или массивом). */
function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value ? [value] : [];
}

export async function checkBrandEntity(rawUrl: string, rawBrand: string | null) {
  const brand = String(rawBrand || '').trim();
  if (brand.length < 2 || brand.length > 120) throw new TypeError('Укажите название бренда');
  const requested = assertPublicWebsiteUrl(rawUrl);
  requested.pathname = '/';
  requested.search = '';
  requested.hash = '';

  const [{ response, finalUrl, finish }, wikidataFound] = await Promise.all([fetchBrandPage(requested.href), findBrandInWikidata(brand)]);

  const contentType = (response.headers.get('Content-Type') || '').toLowerCase();
  if (!response.ok) {
    finish();
    throw new Error('Главная страница отвечает кодом ' + response.status);
  }
  if (contentType && !contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
    finish();
    throw new Error('Главная страница сайта недоступна или вернула не HTML');
  }

  let document: HtmlDocument;
  try {
    document = await readHtmlDocument(response, finalUrl, 'brand');
  } finally {
    finish();
  }
  const accessible = document.sourceBytes > 0;
  if (!accessible) throw new Error('Главная страница сайта недоступна или вернула не HTML');

  const title = document.title;
  const h1 = document.h1s[0] || '';
  const description = documentMeta(document, 'description');
  const ogSiteName = documentMeta(document, 'og:site_name');
  const canonicalRaw = documentLink(document, 'canonical');
  let canonicalMatches = false;
  try {
    canonicalMatches = new URL(canonicalRaw, finalUrl).origin === finalUrl.origin;
  } catch {}

  const nodes = brandJsonLd(document.jsonld);
  const orgTypes = new Set(['organization', 'corporation', 'localbusiness', 'professionalservice', 'agency']);
  const organizations: JsonLdNode[] = nodes.filter((node) => {
    const rawType = node['@type'];
    const types: unknown[] = Array.isArray(rawType) ? rawType : [rawType];
    return types.some((type) => orgTypes.has(String(type || '').toLowerCase()));
  });
  const schemaNames = organizations.flatMap((node) => [node.name, node.alternateName, node.legalName]).filter(Boolean);
  const schemaNameMatches = schemaNames.some(
    (name) => brandNorm(name) === brandNorm(brand) || brandNorm(name).includes(brandNorm(brand)) || brandNorm(brand).includes(brandNorm(name)),
  );
  const schemaUrls = organizations.flatMap((node) => [node.url, node['@id']]).filter(Boolean);
  const schemaUrlMatches = schemaUrls.some((value) => {
    try {
      return new URL(String(value), finalUrl).origin === finalUrl.origin;
    } catch {
      return false;
    }
  });
  const sameAs = [...new Set(organizations.flatMap((node) => asList(node.sameAs)).filter(Boolean))];
  const socialDomains = ['instagram.com', 'facebook.com', 'linkedin.com', 'youtube.com', 't.me', 'threads.net', 'threads.com', 'x.com', 'twitter.com', 'vk.com'];
  const socialProfiles = sameAs.filter((value) => {
    try {
      return socialDomains.some((domain) => new URL(String(value)).hostname.toLowerCase().endsWith(domain));
    } catch {
      return false;
    }
  });
  const schemaLogo = organizations.some((node) => Boolean(node.logo || node.image));
  const schemaContact = organizations.some((node) => Boolean(node.contactPoint));
  const schemaAddress = organizations.some((node) => Boolean(node.address));
  const hasEmail = document.hasEmailLink || organizations.some((node) => Boolean(node.email));
  const hasPhone = document.hasPhoneLink || organizations.some((node) => Boolean(node.telephone));
  const expected = brandNorm(brand);
  const brandInTitle = expected.length > 0 && brandNorm(title).includes(expected);
  const brandInH1 = expected.length > 0 && brandNorm(h1).includes(expected);
  const ogMatches = expected.length > 0 && brandNorm(ogSiteName).includes(expected);

  const signals: Array<[string, boolean, number]> = [
    ['Сайт отвечает', accessible, 10],
    ['Используется HTTPS', finalUrl.protocol === 'https:', 4],
    ['Canonical ведет на основной домен', canonicalMatches, 6],
    ['Бренд указан в title', brandInTitle, 8],
    ['Бренд указан в H1', brandInH1, 6],
    ['og:site_name совпадает с брендом', ogMatches, 5],
    ['Есть meta description', description.length >= 60, 3],
    ['Есть Organization или LocalBusiness', organizations.length > 0, 12],
    ['Название в разметке совпадает', schemaNameMatches, 8],
    ['URL в разметке совпадает с доменом', schemaUrlMatches, 6],
    ['В разметке указан логотип', schemaLogo, 5],
    ['В разметке есть sameAs', sameAs.length > 0, 7],
    ['Связаны минимум два профиля', socialProfiles.length >= 2, 4],
    ['На сайте указана почта', hasEmail, 3],
    ['На сайте указан телефон', hasPhone, 3],
    ['В разметке есть contactPoint', schemaContact, 3],
    ['В разметке есть адрес', schemaAddress, 3],
    ['Бренд найден в Wikidata', wikidataFound, 4],
  ];

  const score = signals.reduce((sum, signal) => sum + (signal[1] ? signal[2] : 0), 0);
  const found = signals.filter((signal) => signal[1]).length;
  const titleResult = score >= 80 ? 'Сущность хорошо связана' : score >= 55 ? 'Сущность собрана частично' : 'Сущность выражена слабо';
  const copy =
    score >= 80
      ? 'Основные сигналы бренда согласованы. Усильте внешние подтверждения и поддерживайте разметку.'
      : score >= 55
        ? 'Часть сигналов найдена, но поисковым и AI-системам не хватает связей между сайтом, разметкой и профилями.'
        : 'На сайте мало проверяемых сигналов бренда. Начните с названия, Organization, контактов и официальных профилей.';

  const nameEarned = (brandInTitle ? 8 : 0) + (brandInH1 ? 6 : 0) + (ogMatches ? 5 : 0) + (schemaNameMatches ? 8 : 0);
  const domainEarned = (accessible ? 10 : 0) + (finalUrl.protocol === 'https:' ? 4 : 0) + (canonicalMatches ? 6 : 0) + (schemaUrlMatches ? 6 : 0);
  const orgEarned = (description.length >= 60 ? 3 : 0) + (organizations.length > 0 ? 12 : 0) + (schemaAddress ? 3 : 0);
  const contactsEarned = (hasEmail ? 3 : 0) + (hasPhone ? 3 : 0) + (schemaContact ? 3 : 0);
  const profilesEarned = (sameAs.length > 0 ? 7 : 0) + (socialProfiles.length >= 2 ? 4 : 0);
  const markupEarned = (organizations.length > 0 ? 12 : 0) + (schemaLogo ? 5 : 0) + (schemaContact ? 3 : 0) + (schemaAddress ? 3 : 0);

  return {
    brand,
    checkedUrl: finalUrl.href,
    score,
    found,
    total: signals.length,
    truncated: document.structuredDataTruncated,
    contentTruncated: document.truncated,
    structuredDataTruncated: document.structuredDataTruncated,
    title: titleResult,
    copy,
    checks: [
      brandCategory('Название', nameEarned, 27, 'Название бренда согласовано с основными элементами страницы.', 'Согласуйте название бренда в title, H1, og:site_name и разметке.', 75),
      brandCategory('Домен', domainEarned, 26, 'Основной домен подтвержден техническими сигналами.', 'Закрепите основной HTTPS-домен через canonical и URL в разметке.'),
      brandCategory('Организация', orgEarned, 18, 'Тип организации и описание читаются однозначно.', 'Добавьте Organization или LocalBusiness, описание и адрес.'),
      brandCategory('Контакты', contactsEarned, 9, 'Телефон и почта подтверждают организацию.', 'Укажите телефон, почту и contactPoint в разметке.'),
      brandCategory('Профили', profilesEarned, 11, 'Официальные профили связаны с сайтом.', 'Добавьте sameAs минимум с двумя официальными профилями.'),
      brandCategory('Разметка', markupEarned, 23, 'Разметка содержит основные свойства сущности.', 'Дополните Organization логотипом, контактами и адресом.'),
    ],
    signals: signals.map(([label, passed, weight]) => ({ label, passed, weight })),
    evidence: {
      title,
      h1,
      canonical: canonicalRaw,
      organizationTypes: organizations.map((node) => node['@type']).filter(Boolean),
      sameAs,
      socialProfiles,
      wikidataFound,
    },
  };
}
