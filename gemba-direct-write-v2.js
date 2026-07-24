'use strict';

const ACTIONS_CONNECTION_URL = 'https://raw.githubusercontent.com/aruanmf446-hub/SEP/dados/dados/conexao-actions.json';

async function tokenFingerprint(token) {
  const bytes = new TextEncoder().encode(String(token || '').trim());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

async function readChaveyStatus() {
  const response = await fetch(`${ACTIONS_CONNECTION_URL}?v=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Ainda não foi possível ler a validação do CHAVEY no GitHub Actions. Aguarde a publicação atual terminar e tente novamente.');
  return response.json();
}

testGithubConnection = async function testGithubConnectionDirectV13(candidateConfig) {
  const previousConfig = config;
  const candidate = {
    ...DEFAULT_CONFIG,
    ...candidateConfig,
    token: String(candidateConfig?.token || '').trim()
  };

  if (!tokenLooksValid(candidate.token)) {
    throw new Error('Cole o token completo que começa com github_pat_ ou ghp_.');
  }

  const status = await readChaveyStatus();
  const pastedFingerprint = await tokenFingerprint(candidate.token);
  if (!status.tokenFingerprint) {
    throw new Error('O workflow ainda não publicou a impressão digital do CHAVEY. Aguarde a execução “Validar armazenamento GitHub” terminar e tente novamente.');
  }
  if (pastedFingerprint !== status.tokenFingerprint) {
    throw new Error('O token colado no navegador não é o mesmo token armazenado em Environments > gembraa > CHAVEY.');
  }

  config = { ...candidate, login: status.authenticatedUser || 'aruanmf446-hub' };
  try {
    const auth = await window.SEP_SELECT_AUTH_MODE(true);
    const testId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const path = `dados/testes-browser/conexao-${testId}.json`;
    const apiUrl = `${apiBase}/repos/aruanmf446-hub/SEP/contents/${path}`;
    const payload = {
      app: 'SEP - Construtor Gemba',
      source: 'navegador',
      authenticatedUser: auth.login || status.authenticatedUser,
      authenticationMode: auth.mode,
      repository: 'aruanmf446-hub/SEP',
      branch: 'dados',
      matchedChavey: true,
      testedAt: nowIso()
    };

    const response = await window.SEP_AUTHENTICATED_FETCH(apiUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Validar gravação direta do SEP pelo navegador',
        content: encodeUtf8Base64(JSON.stringify(payload, null, 2)),
        branch: 'dados'
      })
    });

    const result = await response.json();
    return {
      login: auth.login || status.authenticatedUser,
      repository: 'aruanmf446-hub/SEP',
      branch: 'dados',
      canWrite: true,
      authMode: auth.mode,
      path,
      commit: result?.commit?.sha || ''
    };
  } finally {
    config = previousConfig;
  }
};
