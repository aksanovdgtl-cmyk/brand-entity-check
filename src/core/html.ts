// Потоковый разбор HTML проверяемой страницы: мета, title, H1-H3, абзацы, ссылки, JSON-LD - с лимитами
// по байтам и символам. Разбор идет через HTMLRewriter (lol-html), встроенный в Cloudflare Workers.
// Источник: сервер инструментов hitz.agency (https://hitz.agency/tools).

export interface RewriterElement {
  getAttribute(name: string): string | null;
  onEndTag(handler: () => void): void;
}
export interface RewriterText {
  readonly text: string;
}
export interface RewriterHandlers {
  element?(element: RewriterElement): void;
  text?(chunk: RewriterText): void;
}
export interface Rewriter {
  on(selector: string, handlers: RewriterHandlers): Rewriter;
  transform(response: Response): Response;
}

function createRewriter(): Rewriter {
  const Ctor = (globalThis as { HTMLRewriter?: new () => Rewriter }).HTMLRewriter;
  if (!Ctor) throw new Error('Проверка страниц недоступна на этом сервере');
  return new Ctor();
}

const MAX_DOCUMENT_BYTES = 512 * 1024;
const MAX_STRUCTURED_TEXT_CHARS = 384 * 1024;

export function brandDecode(value: unknown): string {
  return String(value || '')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ');
}

export function brandText(value: unknown): string {
  return brandDecode(String(value || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

export function brandNorm(value: unknown): string {
  return brandText(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

export interface HtmlDocument {
  meta: Record<string, string>;
  links: Record<string, string>;
  title: string;
  h1s: string[];
  headings: string[];
  paragraphs: string[];
  intro: string;
  bodyText: string;
  jsonld: string[];
  outboundSources: number;
  lang: string;
  hasListOrTable: boolean;
  hasTime: boolean;
  hasEmailLink: boolean;
  hasPhoneLink: boolean;
  sourceBytes: number;
  truncated: boolean;
  structuredDataTruncated: boolean;
}

export function documentMeta(document: HtmlDocument, key: string): string {
  return document.meta[String(key || '').toLowerCase()] || '';
}

export function documentLink(document: HtmlDocument, relName: string): string {
  return document.links[String(relName || '').toLowerCase()] || '';
}

function appendCollected(document: HtmlDocument, current: string, value: string, limit: number, markTruncated = true): string {
  if (!value || current.length >= limit) {
    if (markTruncated && value && current.length >= limit) document.truncated = true;
    return current;
  }
  const remaining = limit - current.length;
  if (markTruncated && value.length > remaining) document.truncated = true;
  return current + value.slice(0, remaining);
}

/** Узел JSON-LD: объект с произвольными полями. */
export type JsonLdNode = Record<string, unknown>;

/** Все узлы JSON-LD блоков (с развернутым @graph); блоки с ошибкой синтаксиса пропускаются. */
export function brandJsonLd(scripts: string[]): JsonLdNode[] {
  const nodes: JsonLdNode[] = [];
  for (const source of scripts || []) {
    try {
      const parsed: unknown = JSON.parse(brandDecode(source.trim()));
      const visit = (value: unknown): void => {
        if (!value) return;
        if (Array.isArray(value)) return value.forEach(visit);
        if (typeof value !== 'object') return;
        const node = value as JsonLdNode;
        nodes.push(node);
        if (node['@graph']) visit(node['@graph']);
      };
      visit(parsed);
    } catch {}
  }
  return nodes;
}

export function parseJsonLdBlocks(scripts: string[]): { blocks: unknown[]; errors: string[] } {
  const blocks: unknown[] = [];
  const errors: string[] = [];

  for (const source of scripts || []) {
    try {
      blocks.push(JSON.parse(brandDecode(String(source || '').trim())));
    } catch (error) {
      errors.push(error instanceof Error && error.message ? error.message : 'Некорректный JSON-LD');
    }
  }

  return { blocks, errors };
}

export function jsonLdTypeList(blocks: unknown[]): string[] {
  const types: string[] = [];
  const visit = (value: unknown): void => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== 'object') return;
    const node = value as JsonLdNode;

    const rawType = node['@type'];
    const rawTypes: unknown[] = Array.isArray(rawType) ? rawType : rawType ? [rawType] : [];
    rawTypes.forEach((type) => {
      const normalized = brandText(type);
      if (normalized) types.push(normalized);
    });
    if (node['@graph']) visit(node['@graph']);
  };

  blocks.forEach(visit);
  return types;
}

export function jsonLdHasRelativeUrl(blocks: unknown[]): boolean {
  const urlKeys = new Set(['url', 'image', 'logo', 'sameAs', 'contentUrl', 'thumbnailUrl', 'mainEntityOfPage']);
  let found = false;
  const visit = (value: unknown, key = ''): void => {
    if (found || value == null) return;
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, key));
      return;
    }
    if (typeof value === 'object') {
      Object.entries(value).forEach(([childKey, childValue]) => visit(childValue, childKey));
      return;
    }
    if (urlKeys.has(key) && typeof value === 'string' && value && !/^https?:\/\//i.test(value) && !/^#/.test(value)) {
      found = true;
    }
  };
  blocks.forEach((block) => visit(block));
  return found;
}

async function collectJsonLd(body: ReadableStream<Uint8Array> | null, responseHeaders: Headers, document: HtmlDocument): Promise<void> {
  if (!body) return;

  let ldBuffer = '';
  let jsonldChars = 0;
  const rewriter = createRewriter().on('script[type="application/ld+json"]', {
    element(element) {
      ldBuffer = '';
      element.onEndTag(() => {
        const value = ldBuffer.trim();
        if (value) {
          document.jsonld.push(value);
          jsonldChars += value.length;
        }
        ldBuffer = '';
      });
    },
    text(chunk) {
      const remaining = MAX_STRUCTURED_TEXT_CHARS - jsonldChars - ldBuffer.length;
      if (remaining <= 0) {
        if (chunk.text) document.structuredDataTruncated = true;
        return;
      }
      if (chunk.text.length > remaining) document.structuredDataTruncated = true;
      ldBuffer += chunk.text.slice(0, remaining);
    },
  });

  const headers = new Headers(responseHeaders);
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  const transformed = rewriter.transform(new Response(body, { headers }));
  if (!transformed.body) return;

  const reader = transformed.body.getReader();
  try {
    while (!(await reader.read()).done) {}
  } finally {
    reader.releaseLock();
  }
}

/**
 * Разбор страницы: mode 'brand' - 96 КБ HTML, 'geo' и 'schema' - 160 КБ (плюс заголовки H2-H3, абзацы,
 * списки и даты для 'geo'). JSON-LD собирается отдельным проходом по всей странице (до 384 тыс. символов).
 */
export async function readHtmlDocument(response: Response, finalUrl: URL, mode: 'brand' | 'geo' | 'schema'): Promise<HtmlDocument> {
  const document: HtmlDocument = {
    meta: Object.create(null) as Record<string, string>,
    links: Object.create(null) as Record<string, string>,
    title: '',
    h1s: [],
    headings: [],
    paragraphs: [],
    intro: '',
    bodyText: '',
    jsonld: [],
    outboundSources: 0,
    lang: '',
    hasListOrTable: false,
    hasTime: false,
    hasEmailLink: false,
    hasPhoneLink: false,
    sourceBytes: 0,
    truncated: false,
    structuredDataTruncated: false,
  };

  if (!response.body) return document;

  const analysisLimit = mode === 'brand' ? 96 * 1024 : 160 * 1024;
  const byteLimit = Math.min(MAX_DOCUMENT_BYTES, analysisLimit);
  const declaredLength = Number(response.headers.get('Content-Length') || 0);
  if (declaredLength > byteLimit) document.truncated = true;

  let seenH1 = false;
  let h1SourceOffset = -1;
  let h1Buffer = '';
  let titleBuffer = '';
  let headingBuffer = '';
  let paragraphBuffer = '';

  let rewriter = createRewriter()
    .on('html', {
      element(element) {
        if (!document.lang) document.lang = brandDecode(element.getAttribute('lang') || '');
      },
    })
    .on('meta', {
      element(element) {
        const key = String(element.getAttribute('name') || element.getAttribute('property') || '').toLowerCase();
        if (key && !(key in document.meta)) document.meta[key] = brandDecode(element.getAttribute('content') || '');
      },
    })
    .on('link', {
      element(element) {
        const href = brandDecode(element.getAttribute('href') || '');
        const rel = String(element.getAttribute('rel') || '').toLowerCase();
        if (rel.includes('canonical') && !document.links.canonical) document.links.canonical = href;
      },
    })
    .on('title', {
      element(element) {
        titleBuffer = '';
        element.onEndTag(() => {
          if (!document.title) document.title = brandText(titleBuffer);
          titleBuffer = '';
        });
      },
      text(chunk) {
        if (!document.title) titleBuffer = appendCollected(document, titleBuffer, chunk.text, 8_192, false);
      },
    })
    .on('h1', {
      element(element) {
        seenH1 = true;
        h1SourceOffset = document.sourceBytes;
        h1Buffer = '';
        element.onEndTag(() => {
          const value = brandText(h1Buffer);
          if (value) document.h1s.push(value);
          h1Buffer = '';
        });
      },
      text(chunk) {
        h1Buffer = appendCollected(document, h1Buffer, chunk.text, 8_192, false);
      },
    })
    .on('a[href]', {
      element(element) {
        const href = element.getAttribute('href') || '';
        if (!document.hasEmailLink && /^mailto:/i.test(href)) document.hasEmailLink = true;
        if (!document.hasPhoneLink && /^tel:/i.test(href)) document.hasPhoneLink = true;
        if (mode === 'geo' && document.outboundSources < 2 && !/^(?:mailto|tel|javascript):/i.test(href)) {
          try {
            const linked = new URL(href, finalUrl);
            if ((linked.protocol === 'http:' || linked.protocol === 'https:') && linked.hostname !== finalUrl.hostname) {
              document.outboundSources += 1;
            }
          } catch {}
        }
      },
    });

  if (mode === 'geo') {
    rewriter = rewriter
      .on('h2, h3', {
        element(element) {
          headingBuffer = '';
          element.onEndTag(() => {
            const value = brandText(headingBuffer);
            if (value) document.headings.push(value);
            headingBuffer = '';
          });
        },
        text(chunk) {
          headingBuffer = appendCollected(document, headingBuffer, chunk.text, 2_048, false);
        },
      })
      .on('p', {
        element(element) {
          if (document.paragraphs.length >= 4 && document.intro) return;
          paragraphBuffer = '';
          element.onEndTag(() => {
            const value = brandText(paragraphBuffer);
            if (!document.intro && seenH1 && document.sourceBytes - h1SourceOffset <= 7_000) document.intro = value;
            if (value.length >= 35 && document.paragraphs.length < 4) document.paragraphs.push(value);
            paragraphBuffer = '';
          });
        },
        text(chunk) {
          if (document.paragraphs.length < 4 || !document.intro) {
            paragraphBuffer = appendCollected(document, paragraphBuffer, chunk.text, 2_048, false);
          }
        },
      })
      .on('ul, ol, table', {
        element() {
          document.hasListOrTable = true;
        },
      })
      .on('time', {
        element() {
          document.hasTime = true;
        },
      });
  }

  const [analysisBody, structuredBody] = response.body.tee();
  const structuredPromise = collectJsonLd(structuredBody, response.headers, document);
  const upstream = analysisBody.getReader();
  const limitedBody = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await upstream.read();
      if (done) {
        controller.close();
        return;
      }
      const remaining = byteLimit - document.sourceBytes;
      if (value.byteLength > remaining) {
        if (remaining > 0) controller.enqueue(value.subarray(0, remaining));
        document.sourceBytes += Math.max(0, remaining);
        document.truncated = true;
        upstream.cancel('document byte limit reached').catch(() => {});
        controller.close();
        return;
      }
      document.sourceBytes += value.byteLength;
      controller.enqueue(value);
      if (document.sourceBytes === byteLimit && declaredLength > byteLimit) {
        document.truncated = true;
        upstream.cancel('document byte limit reached').catch(() => {});
        controller.close();
      }
    },
    cancel(reason) {
      return upstream.cancel(reason);
    },
  });

  const limitedHeaders = new Headers(response.headers);
  limitedHeaders.delete('Content-Length');
  limitedHeaders.delete('Content-Encoding');
  const transformed = rewriter.transform(
    new Response(limitedBody, {
      status: response.status,
      statusText: response.statusText,
      headers: limitedHeaders,
    }),
  );
  if (!transformed.body) {
    await structuredPromise;
    return document;
  }

  const reader = transformed.body.getReader();
  try {
    while (!(await reader.read()).done) {}
  } finally {
    reader.releaseLock();
  }
  await structuredPromise;
  return document;
}
