'use strict';

const DEFAULT_CONFIG = { apiBase: '/api/blob' };
const CONFIG_KEY = 'sep-gemba-blob-config-v1';
const SESSION_KEY = 'sep-gemba-inspector-session-v1';

let config = loadConfig();
let templates = [];
let submissions = [];
let reviews = [];
let activeTab = 'templates';
let editingTemplate = null;
let editingItems = [];
let reviewContext = null;
let inspectorState = null;

const $ = id => document.getElementById(id);
const nowIso = () => new Date().toISOString();
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const slugify = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);
const escapeHTML = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const formatDateTime = value => value ? new Intl.DateTimeFormat('pt-BR',{ dateStyle:'short', timeStyle:'short' }).format(new Date(value)) : '—';

function loadConfig() {
  try { return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}') }; }
  catch (_) { return { ...DEFAULT_CONFIG }; }
}

function saveConfig(next) {
  config = { ...DEFAULT_CONFIG, ...next };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

function resolvedApiBase() {
  const explicit = String(config.apiBase || '').trim();
  if (explicit && explicit !== '/api/blob') return explicit.replace(/\/$/, '');
  return `${window.location.origin}/api/blob`;
}

function blobPath(path) {
  const clean = String(path || '').replace(/^\/+/, '');
  return clean.startsWith('sep/') ? clean : `sep/${clean}`;
}

function logicalPath(pathname) {
  return String(pathname || '').replace(/^sep\//, '');
}

async function blobRequest(action, { method = 'GET', query = {}, body } = {}) {
  const url = new URL(resolvedApiBase());
  url.searchParams.set('action', action);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });

  let response;
  try {
    response = await fetch(url, {
      method,
      cache: 'no-store',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (_) {
    throw new Error('Não foi possível acessar a API do Vercel Blob. Abra o SEP pela URL da Vercel ou confira a implantação.');
  }

  let payload = null;
  try { payload = await response.json(); } catch (_) { payload = null; }
  if (!response.ok) throw new Error(payload?.error || `Erro do armazenamento Blob (${response.status}).`);
  return payload;
}

async function testBlobConnection() {
  return blobRequest('status');
}

async function listDirectory(path) {
  const prefix = `${blobPath(path).replace(/\/$/, '')}/`;
  const result = await blobRequest('list', { query: { prefix } });
  const children = new Map();

  for (const blob of result.blobs || []) {
    const relative = blob.pathname.slice(prefix.length);
    if (!relative) continue;
    const [first, ...rest] = relative.split('/');
    if (!first) continue;
    if (rest.length) {
      if (!children.has(first)) children.set(first, { name: first, type: 'dir', path: logicalPath(`${prefix}${first}`) });
    } else {
      children.set(first, {
        name: first,
        type: 'file',
        path: logicalPath(blob.pathname),
        size: blob.size,
        url: blob.url,
        uploadedAt: blob.uploadedAt,
      });
    }
  }
  return [...children.values()];
}

async function readJson(path, allowMissing = false) {
  try {
    const result = await blobRequest('get', { query: { path: blobPath(path) } });
    return { data: JSON.parse(result.text), sha: null, etag: result.etag };
  } catch (error) {
    if (allowMissing && /não encontrado|not found/i.test(error.message)) return null;
    throw error;
  }
}

async function putContent(path, base64Content, message = '') {
  return blobRequest('put-base64', {
    method: 'POST',
    body: {
      path: blobPath(path),
      base64: base64Content,
      contentType: path.endsWith('.jpg') || path.endsWith('.jpeg') ? 'image/jpeg' : path.endsWith('.png') ? 'image/png' : 'application/octet-stream',
      message,
    },
  });
}

async function putJson(path, data, message = '') {
  return blobRequest('put-json', {
    method: 'POST',
    body: { path: blobPath(path), data, message },
  });
}

function rawUrl(path) {
  const url = new URL(resolvedApiBase());
  url.searchParams.set('action', 'file');
  url.searchParams.set('path', blobPath(path));
  return url.toString();
}

function encodeUtf8Base64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function decodeBase64Utf8(base64) {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function showToast(message, type = '') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`.trim();
  toast.textContent = message;
  $('toastContainer').appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

function openModal(id) { $(id).hidden = false; document.body.style.overflow = 'hidden'; }
function closeModal(id) { $(id).hidden = true; document.body.style.overflow = ''; }
function setBusy(button, busy, text = 'Processando...') {
  if (!button) return;
  if (busy) { button.dataset.originalText = button.textContent; button.textContent = text; button.disabled = true; }
  else { button.textContent = button.dataset.originalText || button.textContent; button.disabled = false; }
}

async function compressImage(file, maxWidth = 1280, quality = .74) {
  const dataUrl = await fileToDataUrl(file);
  const image = await loadImage(dataUrl);
  const scale = Math.min(1, maxWidth / image.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  let blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (blob.size > 2_500_000) blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .58));
  const compressedDataUrl = await fileToDataUrl(blob);
  return { dataUrl: compressedDataUrl, base64: compressedDataUrl.split(',')[1], mime: 'image/jpeg', size: blob.size };
}

function fileToDataUrl(file) { return new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); }); }
function loadImage(src) { return new Promise((resolve,reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src; }); }

async function loadAdminData() {
  const button = $('refreshDataButton');
  setBusy(button, true, 'Atualizando...');
  try {
    const templateDirs = await listDirectory('dados/checklists');
    templates = [];
    for (const dir of templateDirs.filter(item => item.type === 'dir')) {
      const model = await readJson(`dados/checklists/${dir.name}/modelo.json`, true);
      if (model) templates.push({ ...model.data, slug: dir.name });
    }

    const submissionChecklistDirs = await listDirectory('dados/respostas');
    submissions = [];
    reviews = [];
    for (const checklistDir of submissionChecklistDirs.filter(item => item.type === 'dir')) {
      const executionDirs = await listDirectory(`dados/respostas/${checklistDir.name}`);
      for (const executionDir of executionDirs.filter(item => item.type === 'dir')) {
        const responseFile = await readJson(`dados/respostas/${checklistDir.name}/${executionDir.name}/resposta.json`, true);
        if (!responseFile) continue;
        const reviewFile = await readJson(`dados/respostas/${checklistDir.name}/${executionDir.name}/avaliacao.json`, true);
        const entry = { ...responseFile.data, checklistSlug: checklistDir.name, submissionId: executionDir.name, review: reviewFile?.data || null };
        submissions.push(entry);
        if (entry.review) reviews.push(entry);
      }
    }

    templates.sort((a,b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    submissions.sort((a,b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
    reviews.sort((a,b) => new Date(b.review?.reviewedAt || 0) - new Date(a.review?.reviewedAt || 0));
    renderAdmin();
  } catch (error) {
    renderAdmin();
    showToast(error.message, 'error');
  } finally { setBusy(button, false); }
}
