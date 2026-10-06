// Сеть: проверка адреса (только публичные сайты), DNS через DoH, загрузка с ручными перенаправлениями и лимитами.
// Только веб-стандарты (fetch, URL, AbortController, потоки).
// Источник: сервер инструментов hitz.agency (https://hitz.agency/tools).

export const MAX_ROBOTS_BYTES = 200_000;
export const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 10_000;
const DOCUMENT_FETCH_TIMEOUT_MS = 5_000;
const DNS_LOOKUP_TIMEOUT_MS = 2_500;
const DNS_CACHE_TTL_MS = 5 * 60 * 1000;
const DNS_CACHE_MAX_ENTRIES = 200;
const dnsSafetyCache = new Map<string, { safe: boolean; expiresAt: number }>();

const REDIRECT_CODES = [301, 302, 303, 307, 308];

/** Адрес сайта от пользователя: только http(s), без логина, стандартный порт, публичное доменное имя. */
export function assertPublicWebsiteUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new TypeError('Некорректный адрес сайта');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new TypeError('Поддерживаются только http и https');
  }
  if (parsed.username || parsed.password) {
    throw new TypeError('Адрес не должен содержать логин или пароль');
  }
  if (parsed.port && !['80', '443'].includes(parsed.port)) {
    throw new TypeError('Поддерживаются только стандартные веб-порты');
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
  const blockedSuffixes = ['.localhost', '.local', '.internal', '.home', '.lan'];
  const isIpLiteral = hostname.includes(':') || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
  const isBlockedName = hostname === 'localhost' || blockedSuffixes.some((suffix) => hostname.endsWith(suffix));
  const isSingleLabel = !hostname.includes('.');

  if (!hostname || isIpLiteral || isBlockedName || isSingleLabel) {
    throw new TypeError('Укажите публичный домен сайта');
  }

  return parsed;
}

export function isBlockedIpv4Address(rawAddress: string): boolean {
  const parts = String(rawAddress).trim().split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a = 0, b = 0, c = 0, d = 0] = parts;
  const value = (((a * 256 + b) * 256 + c) * 256 + d) >>> 0;
  const inRange = (base: number, bits: number) => bits === 0 || value >>> (32 - bits) === base >>> (32 - bits);

  const ranges: Array<[number, number]> = [
    [0x00000000, 8], // Current network
    [0x0a000000, 8], // RFC 1918
    [0x64400000, 10], // Carrier-grade NAT
    [0x7f000000, 8], // Loopback
    [0xa9fe0000, 16], // Link-local
    [0xac100000, 12], // RFC 1918
    [0xc0000000, 24], // IETF protocol assignments
    [0xc0000200, 24], // TEST-NET-1
    [0xc0a80000, 16], // RFC 1918
    [0xc6120000, 15], // Benchmarking
    [0xc6336400, 24], // TEST-NET-2
    [0xcb007100, 24], // TEST-NET-3
    [0xe0000000, 4], // Multicast
    [0xf0000000, 4], // Reserved
  ];
  return ranges.some(([base, bits]) => inRange(base >>> 0, bits));
}

export function isBlockedIpv6Address(rawAddress: string): boolean {
  const address = String(rawAddress).trim().toLowerCase().replace(/^\[|\]$/g, '');
  const mapped = address.match(/(?:^|:)ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped?.[1]) return isBlockedIpv4Address(mapped[1]);
  return (
    address === '::' ||
    address === '::1' ||
    address.startsWith('fc') ||
    address.startsWith('fd') ||
    /^fe[89ab]/.test(address) ||
    address.startsWith('ff') ||
    address.startsWith('2001:db8:')
  );
}

export function isBlockedResolvedAddress(rawAddress: string): boolean {
  const address = String(rawAddress).trim();
  return address.includes(':') ? isBlockedIpv6Address(address) : isBlockedIpv4Address(address);
}

interface DnsJson {
  Status: number;
  Answer?: Array<{ type: number; data?: string }>;
}

async function resolveDnsRecords(hostname: string, type: 'A' | 'AAAA'): Promise<string[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DNS_LOOKUP_TIMEOUT_MS);
  try {
    const endpoint = new URL('https://cloudflare-dns.com/dns-query');
    endpoint.searchParams.set('name', hostname);
    endpoint.searchParams.set('type', type);
    const response = await fetch(endpoint.href, {
      signal: controller.signal,
      headers: { Accept: 'application/dns-json' },
    });
    if (!response.ok) throw new TypeError('Не удалось проверить адрес сайта');
    const payload = (await response.json()) as DnsJson;
    if (payload.Status !== 0 && payload.Status !== 3) throw new TypeError('Не удалось проверить адрес сайта');
    const recordType = type === 'A' ? 1 : 28;
    return (payload.Answer || [])
      .filter((answer) => answer.type === recordType)
      .map((answer) => String(answer.data || '').trim())
      .filter(Boolean);
  } finally {
    clearTimeout(timeout);
  }
}

/** Имя должно указывать на публичные адреса (защита от запросов во внутреннюю сеть). Кэш 5 минут. */
export async function assertHostnameResolvesPublic(hostname: string): Promise<void> {
  const cacheKey = hostname.toLowerCase().replace(/\.$/, '');
  const cached = dnsSafetyCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    if (!cached.safe) throw new TypeError('Укажите публичный домен сайта');
    return;
  }

  const ipv4 = await resolveDnsRecords(cacheKey, 'A');
  const addresses = ipv4.length ? ipv4 : await resolveDnsRecords(cacheKey, 'AAAA');
  const safe = addresses.length > 0 && addresses.every((address) => !isBlockedResolvedAddress(address));

  if (dnsSafetyCache.size >= DNS_CACHE_MAX_ENTRIES) {
    const oldest = dnsSafetyCache.keys().next().value;
    if (oldest !== undefined) dnsSafetyCache.delete(oldest);
  }
  dnsSafetyCache.set(cacheKey, { safe, expiresAt: Date.now() + DNS_CACHE_TTL_MS });
  if (!safe) throw new TypeError('Укажите публичный домен сайта');
}

/** Тело ответа текстом, не больше MAX_ROBOTS_BYTES (robots.txt, llms.txt). */
export async function readLimitedText(response: Response): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_ROBOTS_BYTES) {
        throw new RangeError('robots.txt превышает допустимый размер');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8').decode(combined);
}

/** Текстовый файл сайта (robots.txt, llms.txt): до 3 перенаправлений, каждое - на публичный адрес. */
export async function fetchWithSafeRedirects(initialUrl: string | URL): Promise<Response> {
  let current = assertPublicWebsiteUrl(String(initialUrl));

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertHostnameResolvesPublic(current.hostname);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(current.href, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'HITZ-AI-crawler-check/1.0',
          Accept: 'text/plain,*/*;q=0.5',
        },
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!REDIRECT_CODES.includes(response.status)) return response;
    if (redirectCount === MAX_REDIRECTS) throw new Error('Слишком много перенаправлений');

    const location = response.headers.get('Location');
    if (!location) throw new Error('Некорректное перенаправление');
    current = assertPublicWebsiteUrl(new URL(location, current).href);
  }

  throw new Error('Не удалось загрузить robots.txt');
}

export interface FetchedPage {
  response: Response;
  finalUrl: URL;
  /** Снять таймаут загрузки, когда тело прочитано. */
  finish(): void;
}

/** HTML-страница: как fetchWithSafeRedirects, но таймаут 5 с держится до конца чтения тела. */
export async function fetchBrandPage(initialUrl: string): Promise<FetchedPage> {
  let current = assertPublicWebsiteUrl(initialUrl);
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertHostnameResolvesPublic(current.hostname);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DOCUMENT_FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(current.href, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'HITZ-GEO-Audit/1.0 (+https://hitz.agency)',
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
        },
      });
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }

    if (!REDIRECT_CODES.includes(response.status)) {
      return {
        response,
        finalUrl: current,
        finish() {
          clearTimeout(timeout);
        },
      };
    }

    clearTimeout(timeout);
    if (response.body) await response.body.cancel().catch(() => {});
    if (redirectCount === MAX_REDIRECTS) throw new Error('Слишком много перенаправлений');
    const location = response.headers.get('Location');
    if (!location) throw new Error('Некорректное перенаправление');
    current = assertPublicWebsiteUrl(new URL(location, current).href);
  }
  throw new Error('Не удалось загрузить главную страницу');
}
