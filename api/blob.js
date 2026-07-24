import { get, list, put, del } from '@vercel/blob';

const ALLOWED_ORIGINS = new Set(['https://aruanmf446-hub.github.io']);

function corsHeaders(req) {
  const origin = req.headers?.origin || '';
  const allowOrigin = origin.endsWith('.vercel.app') || ALLOWED_ORIGINS.has(origin) ? origin : '*';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function sendJson(req, res, body, status = 200) {
  res.statusCode = status;
  for (const [key, value] of Object.entries(corsHeaders(req))) res.setHeader(key, value);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
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
  return put(pathname, body, {
    access: configuredAccess(),
    allowOverwrite: true,
    contentType,
    cacheControlMaxAge: 60,
  });
}

async function getBlob(pathname, req) {
  return get(pathname, {
    access: configuredAccess(),
    ifNoneMatch: req.headers?.['if-none-match'] || undefined,
  });
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

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    for (const [key, value] of Object.entries(corsHeaders(req))) res.setHeader(key, value);
    res.end();
    return;
  }

  const url = new URL(req.url || '/api/blob', 'https://sep-gemba.vercel.app');
  const action = url.searchParams.get('action') || 'status';

  try {
    if (req.method === 'GET' && action === 'status') {
      const blobs = await list({ prefix: 'sep/', limit: 1 });
      sendJson(req, res, {
        connected: true,
        storage: 'Vercel Blob',
        access: configuredAccess(),
        objects: blobs.blobs.length,
        authentication: process.env.BLOB_READ_WRITE_TOKEN ? 'token' : 'oidc',
      });
      return;
    }

    if (req.method === 'GET' && action === 'list') {
      const prefix = cleanPath(url.searchParams.get('prefix') || 'sep/');
      const blobs = await listAll(prefix);
      sendJson(req, res, {
        blobs: blobs.map(blob => ({
          pathname: blob.pathname,
          url: blob.url,
          downloadUrl: blob.downloadUrl,
          size: blob.size,
          uploadedAt: blob.uploadedAt,
          contentType: blob.contentType,
        })),
      });
      return;
    }

    if (req.method === 'GET' && action === 'get') {
      const pathname = cleanPath(url.searchParams.get('path'));
      const result = await getBlob(pathname, req);
      if (!result || result.statusCode === 404) {
        sendJson(req, res, { error: 'Arquivo não encontrado.' }, 404);
        return;
      }
      if (result.statusCode === 304) {
        res.statusCode = 304;
        res.end();
        return;
      }
      const text = await new Response(result.stream).text();
      sendJson(req, res, { pathname, text, etag: result.blob.etag });
      return;
    }

    if (req.method === 'GET' && action === 'file') {
      const pathname = cleanPath(url.searchParams.get('path'));
      const result = await getBlob(pathname, req);
      if (!result || result.statusCode === 404) {
        res.statusCode = 404;
        res.end('Arquivo não encontrado.');
        return;
      }
      if (result.statusCode === 304) {
        res.statusCode = 304;
        res.end();
        return;
      }
      const buffer = Buffer.from(await new Response(result.stream).arrayBuffer());
      res.statusCode = 200;
      for (const [key, value] of Object.entries(corsHeaders(req))) res.setHeader(key, value);
      res.setHeader('Content-Type', result.blob.contentType || contentTypeFromPath(pathname));
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('ETag', result.blob.etag);
      res.setHeader('Cache-Control', 'private, no-cache');
      res.end(buffer);
      return;
    }

    if (req.method === 'POST') {
      const payload = await readJsonBody(req);

      if (action === 'put-json') {
        const pathname = cleanPath(payload.path);
        const blob = await putBlob(pathname, JSON.stringify(payload.data, null, 2), 'application/json; charset=utf-8');
        sendJson(req, res, { ok: true, blob });
        return;
      }

      if (action === 'put-base64') {
        const pathname = cleanPath(payload.path);
        const bytes = Buffer.from(String(payload.base64 || ''), 'base64');
        const blob = await putBlob(pathname, bytes, payload.contentType || contentTypeFromPath(pathname));
        sendJson(req, res, { ok: true, blob });
        return;
      }

      if (action === 'delete') {
        const pathname = cleanPath(payload.path);
        await del(pathname);
        sendJson(req, res, { ok: true });
        return;
      }
    }

    sendJson(req, res, { error: 'Operação não suportada.' }, 405);
  } catch (error) {
    console.error('SEP Blob API error', error);
    sendJson(req, res, { error: error instanceof Error ? error.message : 'Falha no Vercel Blob.' }, 500);
  }
}
