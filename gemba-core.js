'use strict';

const DEFAULT_CONFIG = { owner: 'aruanmf446-hub', repo: 'SEP', branch: 'dados' };
const CONFIG_KEY = 'sep-gemba-github-config-v1';
const SESSION_KEY = 'sep-gemba-inspector-session-v1';
const apiBase = 'https://api.github.com';

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
function headers(requireAuth = false) {
  const result = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (config.token) result.Authorization = `Bearer ${config.token}`;
  if (requireAuth && !config.token) throw new Error('Informe o token pessoal do GitHub para gravar os dados.');
  return result;
}
function contentUrl(path, ref = config.branch) {
  return `${apiBase}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`;
}
function tokenLooksValid(token) {
  const value = String(token || '').trim();
  return (value.startsWith('github_pat_') || value.startsWith('ghp_')) && value.length > 30;
}
async function githubFetch(url, options = {}) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    throw new Error('Não foi possível acessar a API do GitHub. Verifique a internet e tente novamente.');
  }
  if (response.ok) return response;

  let detail = '';
  try {
    const payload = await response.json();
    detail = payload.message || '';
  } catch (_) {
    detail = await response.text();
  }

  const acceptedPermissions = response.headers.get('x-accepted-github-permissions') || '';
  const oauthScopes = response.headers.get('x-oauth-scopes') || '';
  const suffix = acceptedPermissions ? ` Permissão esperada pelo GitHub: ${acceptedPermissions}.` : '';
  let message = detail || `Erro GitHub ${response.status}`;

  if (response.status === 401) {
    message = 'Token inválido. Cole o valor completo que começa com github_pat_ ou ghp_. O nome do secret “SEP” não é o token.';
  } else if (response.status === 403) {
    if (/rate limit/i.test(detail)) message = 'O limite temporário da API do GitHub foi atingido. Aguarde alguns minutos e tente novamente.';
    else message = `O token foi reconhecido, mas o GitHub negou o acesso.${suffix} Confirme Contents: Read and write e o repositório SEP selecionado.`;
  } else if (response.status === 404) {
    message = 'O GitHub não encontrou o recurso. Confirme proprietário aruanmf446-hub, repositório SEP, branch dados e se o token tem acesso ao repositório.';
  } else if (response.status === 422) {
    message = `O GitHub recusou os dados enviados: ${detail || 'configuração inválida'}. Confirme a branch dados.`;
  }

  const error = Object.assign(new Error(message), {
    status: response.status,
    code: response.status,
    detail,
    acceptedPermissions,
    oauthScopes,
    url
  });
  throw error;
}
async function getContent(path, allowMissing = false) {
  try {
    const response = await githubFetch(contentUrl(path), { headers: headers(false), cache: 'no-store' });
    return response.json();
  } catch (error) {
    if (allowMissing && error.status === 404) return null;
    throw error;
  }
}
async function listDirectory(path) {
  const value = await getContent(path, true);
  return Array.isArray(value) ? value : [];
}
async function readJson(path, allowMissing = false) {
  const file = await getContent(path, allowMissing);
  if (!file) return null;
  if (Array.isArray(file)) throw new Error('Era esperado um arquivo JSON.');
  const text = decodeBase64Utf8(file.content.replace(/\n/g,''));
  return { data: JSON.parse(text), sha: file.sha };
}
async function putContent(path, base64Content, message) {
  headers(true);
  const current = await getContent(path, true);
  const body = { message, content: base64Content, branch: config.branch };
  if (current?.sha) body.sha = current.sha;
  const response = await githubFetch(`${apiBase}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'PUT',
    headers: { ...headers(true), 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return response.json();
}
async function putJson(path, data, message) {
  return putContent(path, encodeUtf8Base64(JSON.stringify(data, null, 2)), message);
}
async function testGithubConnection(candidateConfig, writeTest = true) {
  const previousConfig = config;
  const candidate = { ...DEFAULT_CONFIG, ...candidateConfig, token: String(candidateConfig?.token || '').trim() };

  if (!tokenLooksValid(candidate.token)) {
    throw new Error('Isso não parece ser um token pessoal. Cole o valor completo que começa com github_pat_ ou ghp_, e não o nome “SEP”.');
  }

  config = candidate;
  try {
    const userResponse = await githubFetch(`${apiBase}/user`, { headers: headers(true), cache: 'no-store' });
    const user = await userResponse.json();

    const repoResponse = await githubFetch(`${apiBase}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`, { headers: headers(true), cache: 'no-store' });
    const repo = await repoResponse.json();

    await githubFetch(`${apiBase}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/branches/${encodeURIComponent(config.branch)}`, { headers: headers(true), cache: 'no-store' });

    if (writeTest) {
      await putJson('dados/conexao.json', {
        app: 'SEP - Construtor Gemba',
        authenticatedUser: user.login,
        repository: repo.full_name,
        branch: config.branch,
        testedAt: nowIso()
      }, 'Testar conexão do SEP com o GitHub');
    }

    return {
      login: user.login,
      repository: repo.full_name,
      branch: config.branch,
      canWrite: true
    };
  } finally {
    config = previousConfig;
  }
}
function rawUrl(path) {
  return `https://raw.githubusercontent.com/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/${encodeURIComponent(config.branch)}/${path.split('/').map(encodeURIComponent).join('/')}`;
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
  setTimeout(() => toast.remove(), 4200);
}
function openModal(id) { $(id).hidden = false; document.body.style.overflow = 'hidden'; }
function closeModal(id) { $(id).hidden = true; document.body.style.overflow = ''; }
function setBusy(button, busy, text = 'Processando...') {
  if (!button) return;
  if (busy) { button.dataset.originalText = button.textContent; button.textContent = text; button.disabled = true; }
  else { button.textContent = button.dataset.originalText || button.textContent; button.disabled = false; }
}

async function compressImage(file, maxWidth = 1600, quality = .82) {
  const dataUrl = await fileToDataUrl(file);
  const image = await loadImage(dataUrl);
  const scale = Math.min(1, maxWidth / image.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
  const compressedDataUrl = await fileToDataUrl(blob);
  return { dataUrl: compressedDataUrl, base64: compressedDataUrl.split(',')[1], mime: 'image/jpeg' };
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
    if (!config.token) openGithubSettings();
  } finally { setBusy(button, false); }
}
