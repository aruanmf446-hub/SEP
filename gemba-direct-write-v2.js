'use strict';

// Teste direto v2: realiza uma única gravação nova na branch dados.
// Evita falsos negativos em consultas auxiliares e mostra a resposta exata do GitHub.
testGithubConnection = async function testGithubConnectionDirectV2(candidateConfig) {
  const previousConfig = config;
  const candidate = {
    ...DEFAULT_CONFIG,
    ...candidateConfig,
    token: String(candidateConfig?.token || '').trim()
  };

  if (!tokenLooksValid(candidate.token)) {
    throw new Error('Cole o token completo que começa com github_pat_ ou ghp_.');
  }

  config = candidate;
  const testId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const path = `dados/testes-browser/conexao-${testId}.json`;
  const apiUrl = `${apiBase}/repos/${encodeURIComponent(candidate.owner)}/${encodeURIComponent(candidate.repo)}/contents/${path}`;
  const payload = {
    app: 'SEP - Construtor Gemba',
    source: 'navegador',
    repository: `${candidate.owner}/${candidate.repo}`,
    branch: candidate.branch,
    testedAt: nowIso()
  };
  const body = JSON.stringify({
    message: 'Validar gravação direta do SEP pelo navegador',
    content: encodeUtf8Base64(JSON.stringify(payload, null, 2)),
    branch: candidate.branch
  });

  async function attempt(authScheme) {
    return fetch(apiUrl, {
      method: 'PUT',
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `${authScheme} ${candidate.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      },
      body
    });
  }

  try {
    let response = await attempt('Bearer');
    if (response.status === 401 || response.status === 403) {
      // Compatibilidade adicional para tokens aceitos com o esquema token.
      response = await attempt('token');
    }

    let result = null;
    try { result = await response.json(); } catch (_) { result = null; }

    if (!response.ok) {
      const accepted = response.headers.get('x-accepted-github-permissions') || '';
      const requestId = response.headers.get('x-github-request-id') || '';
      const githubMessage = result?.message || `HTTP ${response.status}`;
      const details = result?.documentation_url ? ` Documentação: ${result.documentation_url}.` : '';
      const permission = accepted ? ` Permissão exigida: ${accepted}.` : '';
      const request = requestId ? ` ID da requisição: ${requestId}.` : '';
      throw new Error(`GitHub recusou a gravação direta: ${githubMessage}.${permission}${details}${request}`);
    }

    const login = result?.commit?.author?.login || result?.content?._links?.git || 'conta autenticada';
    return {
      login,
      repository: `${candidate.owner}/${candidate.repo}`,
      branch: candidate.branch,
      canWrite: true,
      path
    };
  } finally {
    config = previousConfig;
  }
};
