// API инструмента: GET /api/tools/brand-entity?url=... -> JSON. Ядро без привязки к платформе: на вход Request,
// на выход Response (веб-стандарты). Те же маршрут, параметры, ответы и тексты ошибок, что у https://hitz.agency/tools/brand-entity.
//   - запросы из браузера пускаются только со своего домена (заголовок Origin) или без Origin (curl, серверы);
//   - лимит 10 запросов в минуту на IP и 300 на всех - в памяти процесса (в Cloudflare - изолята);
//   - с lang=en ошибки по-английски (core/messages.ts).
import { checkBrandEntity } from './core/brand.ts';
import { errorEn } from './core/messages.ts';

export const ROUTE = 'brand-entity';

export interface ToolsRequestOptions {
  /** IP посетителя для лимита (Cloudflare: CF-Connecting-IP). */
  clientIp?: string | null;
}

function json(status: number, value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

function isAllowedBrowserOrigin(request: Request): boolean {
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin;
}

// Лимиты: скользящее окно в минуту. Память живет, пока жив процесс; точного общего счетчика на все узлы нет.
const WINDOW_MS = 60_000;
const PER_IP_LIMIT = 10;
const GLOBAL_LIMIT = 300;
const MAX_TRACKED_KEYS = 5_000;
const hits = new Map<string, number[]>();

function allow(key: string, limit: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  const ok = recent.length < limit;
  if (ok) recent.push(now);
  hits.delete(key);
  hits.set(key, recent);
  if (hits.size > MAX_TRACKED_KEYS) {
    const oldest = hits.keys().next().value;
    if (oldest !== undefined) hits.delete(oldest);
  }
  return ok;
}

export async function handleToolsRequest(request: Request, options: ToolsRequestOptions = {}): Promise<Response> {
  const url = new URL(request.url);
  const english = String(url.searchParams.get('lang') || '').toLowerCase().startsWith('en');
  const fail = (status: number, message: string) => json(status, { error: english ? errorEn(message) : message });

  if (url.pathname !== `/api/tools/${ROUTE}`) return fail(404, 'Маршрут не найден');

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { Allow: 'GET, OPTIONS' } });
  }

  if (request.method !== 'GET') {
    return fail(405, 'Метод не поддерживается');
  }

  if (!isAllowedBrowserOrigin(request)) {
    return fail(403, 'Источник запроса не разрешен');
  }

  if (!allow(`ip:${options.clientIp || 'unknown'}`, PER_IP_LIMIT)) {
    return fail(429, 'Слишком много запросов. Попробуйте через минуту.');
  }

  if (!allow('global', GLOBAL_LIMIT)) {
    return fail(429, 'Сервис временно перегружен. Попробуйте через минуту.');
  }

  const rawUrl = url.searchParams.get('url');
  if (!rawUrl) return fail(400, 'Укажите адрес сайта');

  try {
    return json(200, await checkBrandEntity(rawUrl, url.searchParams.get('brand')));
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) {
      return fail(400, error.message);
    }
    // AbortError (таймаут) - DOMException, не во всех средах наследник Error: поля читаются напрямую
    const e = (error ?? {}) as { name?: string; message?: string };
    return fail(502, e.name === 'AbortError' ? 'Сайт отвечает слишком долго' : e.message || 'Не удалось проверить сайт');
  }
}
