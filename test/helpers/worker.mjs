// Запуск Worker инструмента в Miniflare (локальный рантайм Cloudflare Workers) без настоящей сети.
// DNS-запросы (DoH к cloudflare-dns.com) и загрузки сайтов отвечают из фикстур теста.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);

/** Публичный адрес для имен из фикстур (адреса из частных диапазонов проверка отклоняет). */
export const PUBLIC_IP = '93.184.215.14';

function buildWorker() {
  const pkgPath = require.resolve('wrangler/package.json');
  const bin = join(dirname(pkgPath), JSON.parse(readFileSync(pkgPath, 'utf8')).bin.wrangler);
  execFileSync(process.execPath, [bin, 'deploy', '--dry-run', '--outdir', '.test-build'], {
    cwd: ROOT,
    stdio: 'pipe',
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: 'true' },
  });
  return join(ROOT, '.test-build', 'worker.js');
}

/**
 * sites: { 'https://example.com/robots.txt': () => new Response(...) } - ответы по точному адресу;
 * dns: { 'internal.example': '10.0.0.5' } - свои адреса для имен (по умолчанию PUBLIC_IP).
 * Возвращает { fetch(path, init), requests, dispose() }.
 */
export async function startWorker({ sites = {}, dns = {} } = {}) {
  const requests = [];
  const mf = new Miniflare({
    modules: true,
    scriptPath: buildWorker(),
    compatibilityDate: '2026-07-01',
    outboundService: async (request) => {
      const url = new URL(request.url);
      requests.push(url.href);
      if (url.hostname === 'cloudflare-dns.com') {
        const name = url.searchParams.get('name') || '';
        const type = url.searchParams.get('type') === 'AAAA' ? 28 : 1;
        const ip = dns[name] ?? PUBLIC_IP;
        const answer = (type === 1) === !ip.includes(':') ? [{ type, data: ip }] : [];
        return Response.json({ Status: 0, Answer: answer });
      }
      const handler = sites[url.href];
      return handler ? handler(request) : new Response('Not found', { status: 404 });
    },
  });
  await mf.ready;
  let client = 0;
  return {
    requests,
    // у каждого запроса свой IP посетителя, чтобы тесты не упирались в лимит 10 запросов в минуту
    fetch: (path, init = {}) => {
      const headers = new Headers(init.headers);
      if (!headers.has('CF-Connecting-IP')) headers.set('CF-Connecting-IP', `198.51.100.${(client++ % 250) + 1}`);
      return mf.dispatchFetch(new URL(path, 'http://tool.test').href, { ...init, headers });
    },
    dispose: () => mf.dispose(),
  };
}

export const html = (body, init = {}) =>
  new Response(body, { status: init.status ?? 200, headers: { 'Content-Type': 'text/html; charset=utf-8', ...init.headers } });
export const text = (body, init = {}) =>
  new Response(body, { status: init.status ?? 200, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...init.headers } });
