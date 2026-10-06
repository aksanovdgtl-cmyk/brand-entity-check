// Cloudflare Worker: /api/* - API инструмента (src/api.ts), остальное - статика из public/ (Workers Static Assets).
import { handleToolsRequest } from './api.ts';

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/')) {
      return handleToolsRequest(request, { clientIp: request.headers.get('CF-Connecting-IP') });
    }
    return env.ASSETS.fetch(request);
  },
};
