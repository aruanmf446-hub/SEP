'use strict';

(function configureBrowserGithubAuthV13() {
  const API_VERSION = '2026-03-10';
  const DEFAULT_LOGIN = 'aruanmf446-hub';
  const AUTH_MODES = ['token', 'Bearer', 'Basic'];

  function authValue(mode, token, login = DEFAULT_LOGIN) {
    const cleanToken = String(token || '').trim();
    if (mode === 'Basic') return `Basic ${btoa(`${login}:${cleanToken}`)}`;
    return `${mode} ${cleanToken}`;
  }

  function baseHeaders() {
    return {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': API_VERSION
    };
  }

  headers = function browserGithubHeadersV13(requireAuth = false) {
    const result = baseHeaders();
    if (requireAuth) {
      if (!config.token) throw new Error('Informe o token pessoal do GitHub para gravar os dados.');
      const mode = config.authMode || 'token';
      result.Authorization = authValue(mode, config.token, config.login || DEFAULT_LOGIN);
    }
    return result;
  };

  async function parseResponse(response, mode) {
    let payload = null;
    try { payload = await response.clone().json(); } catch (_) { payload = null; }
    return {
      mode,
      ok: response.ok,
      status: response.status,
      message: payload?.message || `HTTP ${response.status}`,
      login: payload?.login || '',
      requestId: response.headers.get('x-github-request-id') || '',
      rateLimit: response.headers.get('x-ratelimit-limit') || '',
      oauthScopes: response.headers.get('x-oauth-scopes') || '',
      acceptedPermissions: response.headers.get('x-accepted-github-permissions') || '',
      sso: response.headers.get('x-github-sso') || ''
    };
  }

  async function fetchWithMode(url, options, mode) {
    return fetch(url, {
      ...options,
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      headers: {
        ...baseHeaders(),
        Authorization: authValue(mode, config.token, config.login || DEFAULT_LOGIN),
        ...(options?.headers || {})
      }
    });
  }

  async function probeMode(mode) {
    const response = await fetchWithMode(`${apiBase}/user`, { method: 'GET' }, mode);
    return parseResponse(response, mode);
  }

  async function selectAuthMode(force = false) {
    if (!config.token) throw new Error('Informe o token pessoal do GitHub para gravar os dados.');
    if (!force && config.authMode) {
      const existing = await probeMode(config.authMode);
      if (existing.ok) {
        config.login = existing.login || config.login || DEFAULT_LOGIN;
        return existing;
      }
    }

    const orderedModes = [...new Set([config.authMode, ...AUTH_MODES].filter(Boolean))];
    const attempts = [];
    for (const mode of orderedModes) {
      const result = await probeMode(mode);
      attempts.push(result);
      if (result.ok) {
        config.authMode = mode;
        config.login = result.login || DEFAULT_LOGIN;
        return result;
      }
    }

    const summary = attempts.map(item => `${item.mode}: HTTP ${item.status} ${item.message}${item.requestId ? ` [${item.requestId}]` : ''}`).join(' | ');
    const error = new Error(`O CHAVEY funciona no GitHub Actions, mas este navegador ou a rede não entregou uma autenticação válida à API do GitHub. Testes: ${summary}. Isso normalmente indica bloqueio ou remoção do cabeçalho Authorization pelo navegador, extensão, antivírus ou rede corporativa.`);
    error.attempts = attempts;
    throw error;
  }

  async function authenticatedFetch(url, options = {}) {
    const selected = await selectAuthMode(false);
    let response = await fetchWithMode(url, options, selected.mode);
    if (response.ok) return response;

    const firstFailure = await parseResponse(response, selected.mode);
    if ([401, 403, 404].includes(response.status)) {
      const retry = await selectAuthMode(true);
      if (retry.mode !== selected.mode) {
        response = await fetchWithMode(url, options, retry.mode);
        if (response.ok) return response;
      }
    }

    const failure = await parseResponse(response, config.authMode || selected.mode);
    const request = failure.requestId ? ` ID da requisição: ${failure.requestId}.` : '';
    const sso = failure.sso ? ` SSO: ${failure.sso}.` : '';
    const permissions = failure.acceptedPermissions ? ` Permissão exigida: ${failure.acceptedPermissions}.` : '';
    const error = new Error(`A autenticação chegou ao GitHub como ${config.authMode || selected.mode}, mas a operação foi recusada: ${failure.message}.${permissions}${sso}${request}`);
    error.status = failure.status;
    error.firstFailure = firstFailure;
    error.failure = failure;
    throw error;
  }

  putContent = async function putContentBrowserCompatibleV13(path, base64Content, message) {
    if (!config.token) throw new Error('Informe o token pessoal do GitHub para gravar os dados.');
    const current = await getContent(path, true);
    const body = { message, content: base64Content, branch: config.branch };
    if (current?.sha) body.sha = current.sha;
    const url = `${apiBase}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
    const response = await authenticatedFetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return response.json();
  };

  window.SEP_SELECT_AUTH_MODE = selectAuthMode;
  window.SEP_AUTHENTICATED_FETCH = authenticatedFetch;
})();
