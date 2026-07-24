'use strict';

// Substitui o tratamento genérico antigo por uma resposta precisa da API.
githubFetch = async function githubFetchV12(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      ...options
    });
  } catch (_) {
    throw new Error('Não foi possível acessar a API do GitHub. Verifique a conexão e tente novamente.');
  }

  if (response.ok) return response;

  let payload = null;
  try { payload = await response.json(); } catch (_) { payload = null; }

  const detail = payload?.message || `HTTP ${response.status}`;
  const accepted = response.headers.get('x-accepted-github-permissions') || '';
  const requestId = response.headers.get('x-github-request-id') || '';
  const sso = response.headers.get('x-github-sso') || '';
  const parts = [`GitHub recusou a operação: ${detail}.`];

  if (accepted) parts.push(`Permissão exigida: ${accepted}.`);
  if (sso) parts.push(`Autorização SSO: ${sso}.`);
  if (requestId) parts.push(`ID da requisição: ${requestId}.`);
  if (payload?.documentation_url) parts.push(`Consulte: ${payload.documentation_url}.`);

  const error = new Error(parts.join(' '));
  error.status = response.status;
  error.code = response.status;
  error.detail = detail;
  error.acceptedPermissions = accepted;
  error.requestId = requestId;
  error.sso = sso;
  throw error;
};
