import { get, list, put, del } from '@vercel/blob';

const ALLOWED_ORIGINS = new Set([
  'https://aruanmf446-hub.github.io',
  'https://aruanmf446-hub.github.io/SEP',
]);

function corsHeaders(request) {
  const origin = request.headers.get('origin') || '';
  const allowOrigin = origin.endsWith('.vercel.app') || ALLOWED_ORIGINS.has(origin)
    ? origin
    : '*';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(request, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function cleanPath(value) {
  const path = String(value || '').replace(/^\/+/, '').replace(/\.\./g, '');
  if (!path || !path.startsWith('sep/')) throw new Error('Caminho de armazenamento inválido.');
  return path;
}

function contentTypeFromPath(path) {
  if (path.endsWith('.json')) return 'application/json; charset=utf-8';
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
}

function configuredAccess() {
  return process.env.BLOB_ACCESS === 'private' ? 'private' : 'public';
}

async function putBlob(pathname, body, contentType) {
  const options = {
    access: configuredAccess(),
    allowOverwrite: true,
    contentType,
    cacheControlMaxAge: 60,
  };
  return put(pathname, body, options);
}

async function getBlob(pathname, request) {
  const result = await get(pathname, {
    access: configuredAccess(),
    ifNoneMatch: request.headers.get('if-none-match') || undefined,
  });
  return result;
}

async function listAll(prefix) {
  const blobs = [];
  let cursor;
  do {
    const page = await list({ prefix, limit: 1000, cursor });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return blobs;
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return json(request, { error: 'BLOB_READ_WRITE_TOKEN não configurado no projeto Vercel.' }, 500);
  }

  const url = new URL(request.url);
  const action = url.searchParams.get('action') || 'status';

  try {
    if (request.method === 'GET' && action === 'status') {
      const blobs = await list({ prefix: 'sep/', limit: 1 });
      return json(request, {
        connected: true,
        storage: 'Vercel Blob',
        access: configuredAccess(),
        objects: blobs.blobs.length,
      });
    }

    if (request.method === 'GET' && action === 'list') {
      const prefix = cleanPath(url.searchParams.get('prefix') || 'sep/');
      const blobs = await listAll(prefix);
      return json(request, {
        blobs: blobs.map(blob => ({
          pathname: blob.pathname,
          url: blob.url,
          downloadUrl: blob.downloadUrl,
          size: blob.size,
          uploadedAt: blob.uploadedAt,
          contentType: blob.contentType,
        })),
      });
    }

    if (request.method === 'GET' && action === 'get') {
      const pathname = cleanPath(url.searchParams.get('path'));
      const result = await getBlob(pathname, request);
      if (!result || result.statusCode === 404) return json(request, { error: 'Arquivo não encontrado.' }, 404);
      if (result.statusCode === 304) return new Response(null, { status: 304, headers: corsHeaders(request) });
      const text = await new Response(result.stream).text();
      return json(request, { pathname, text, etag: result.blob.etag });
    }

    if (request.method === 'GET' && action === 'file') {
      const pathname = cleanPath(url.searchParams.get('path'));
      const result = await getBlob(pathname, request);
      if (!result || result.statusCode === 404) return new Response('Arquivo não encontrado.', { status: 404, headers: corsHeaders(request) });
      if (result.statusCode === 304) {
        return new Response(null, {
          status: 304,
          headers: { ...corsHeaders(request), ETag: result.blob.etag, 'Cache-Control': 'private, no-cache' },
        });
      }
      return new Response(result.stream, {
        headers: {
          ...corsHeaders(request),
          'Content-Type': result.blob.contentType || contentTypeFromPath(pathname),
          'X-Content-Type-Options': 'nosniff',
          ETag: result.blob.etag,
          'Cache-Control': 'private, no-cache',
        },
      });
    }

    if (request.method === 'POST') {
      const payload = await request.json();

      if (action === 'put-json') {
        const pathname = cleanPath(payload.path);
        const blob = await putBlob(pathname, JSON.stringify(payload.data, null, 2), 'application/json; charset=utf-8');
        return json(request, { ok: true, blob });
      }

      if (action === 'put-base64') {
        const pathname = cleanPath(payload.path);
        const bytes = Buffer.from(String(payload.base64 || ''), 'base64');
        const blob = await putBlob(pathname, bytes, payload.contentType || contentTypeFromPath(pathname));
        return json(request, { ok: true, blob });
      }

      if (action === 'delete') {
        const pathname = cleanPath(payload.path);
        await del(pathname);
        return json(request, { ok: true });
      }
    }

    return json(request, { error: 'Operação não suportada.' }, 405);
  } catch (error) {
    console.error('SEP Blob API error', error);
    return json(request, { error: error instanceof Error ? error.message : 'Falha no Vercel Blob.' }, 500);
  }
}
