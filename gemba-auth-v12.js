'use strict';

// Compatibilidade de autenticação para gravações feitas diretamente pelo navegador.
// O GitHub aceita os esquemas "token" e "Bearer"; esta versão tenta ambos.
(function configureBrowserGithubAuth() {
  const API_VERSION = '2026-03-10';

  headers = function browserGithubHeaders(requireAuth = false, authScheme = 'token') {
    const result = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': API_VERSION
    };
    if (config.token) result.Authorization = `${authScheme} ${String(config.token).trim()}`;
    if (requireAuth && !config.token) throw new Error('Informe o token pessoal do GitHub para gravar os dados.');
    return result;
  };

  async function parseGithubFailure(response) {
    let payload = null;
    try { payload = await response.json(); } catch (_) { payload = null; }
    return {
      status: response.status,
      message: payload?.message || `HTTP ${response.status}`,
      documentationUrl: payload?.documentation_url || '',
      requestId: response.headers.get('x-github-request-id') || '',
      acceptedPermissions: response.headers.get('x-accepted-github-permissions') || '',
      sso: response.headers.get('x-github-sso') || ''
    };
  }

  async function authenticatedFetch(url, options = {}) {
    const schemes = ['token', 'Bearer'];
    let lastFailure = null;

    for (const scheme of schemes) {
      const response = await fetch(url, {
        ...options,
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        headers: {
          ...headers(true, scheme),
          ...(options.headers || {})
        }
      });
      if (response.ok) return response;
      lastFailure = await parseGithubFailure(response);
    }

    const detail = lastFailure || { status: 0, message: 'Falha desconhecida' };
    const request = detail.requestId ? ` ID da requisição: ${detail.requestId}.` : '';
    const permissions = detail.acceptedPermissions ? ` Permissão exigida: ${detail.acceptedPermissions}.` : '';
    const sso = detail.sso ? ` Autorização SSO: ${detail.sso}.` : '';
    const error = new Error(`GitHub recusou a autenticação enviada pelo navegador: ${detail.message}.${permissions}${sso}${request}`);
    error.status = detail.status;
    error.detail = detail.message;
    throw error;
  }

  putContent = async function putContentBrowserCompatible(path, base64Content, message) {
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

  window.SEP_AUTHENTICATED_FETCH = authenticatedFetch;
})();
