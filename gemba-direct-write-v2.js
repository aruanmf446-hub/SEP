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

// Teste direto: primeiro confirma se o token colado é exatamente o mesmo guardado em gembraa > CHAVEY.
testGithubConnection = async function testGithubConnectionDirectV3(candidateConfig) {
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
    throw new Error('O token colado no navegador não é o mesmo token armazenado em Environments > gembraa > CHAVEY. O CHAVEY está autorizado e grava na branch dados; cole no front exatamente o mesmo valor usado nesse secret.');
  }

  config = candidate;
  const testId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const path = `dados/testes-browser/conexao-${testId}.json`;
  const apiUrl = `${apiBase}/repos/${encodeURIComponent(candidate.owner)}/${encodeURIComponent(candidate.repo)}/contents/${path}`;
  const payload = {
    app: 'SEP - Construtor Gemba',
    source: 'navegador',
    authenticatedUser: status.authenticatedUser,
    repository: `${candidate.owner}/${candidate.repo}`,
    branch: candidate.branch,
    matchedChavey: true,
    testedAt: nowIso()
  };
  const body = JSON.stringify({
    message: 'Validar gravação direta do SEP pelo navegador',
    content: encodeUtf8Base64(JSON.stringify(payload, null, 2)),
    branch: candidate.branch
  });

  try {
    const response = await fetch(apiUrl, {
      method: 'PUT',
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${candidate.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      },
      body
    });

    let result = null;
    try { result = await response.json(); } catch (_) { result = null; }

    if (!response.ok) {
      const requestId = response.headers.get('x-github-request-id') || '';
      const githubMessage = result?.message || `HTTP ${response.status}`;
      const request = requestId ? ` ID da requisição: ${requestId}.` : '';
      throw new Error(`O token corresponde ao CHAVEY, mas o GitHub recusou a gravação direta: ${githubMessage}.${request}`);
    }

    return {
      login: status.authenticatedUser,
      repository: `${candidate.owner}/${candidate.repo}`,
      branch: candidate.branch,
      canWrite: true,
      path
    };
  } finally {
    config = previousConfig;
  }
};
