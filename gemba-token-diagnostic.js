'use strict';

// Sobrescreve o teste padrão para informar exatamente onde a integração falha.
testGithubConnection = async function testGithubConnectionDetailed(candidateConfig, writeTest = true) {
  const previousConfig = config;
  const candidate = { ...DEFAULT_CONFIG, ...candidateConfig, token: String(candidateConfig?.token || '').trim() };

  if (!tokenLooksValid(candidate.token)) {
    throw new Error('Isso não parece ser um token pessoal. Cole o valor completo que começa com github_pat_ ou ghp_.');
  }

  let user = null;
  let repo = null;
  let stage = 'autenticação do token';
  config = candidate;

  try {
    const userResponse = await githubFetch(`${apiBase}/user`, { headers: headers(true), cache: 'no-store' });
    user = await userResponse.json();

    stage = `acesso ao repositório ${config.owner}/${config.repo}`;
    const repoResponse = await githubFetch(`${apiBase}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`, { headers: headers(true), cache: 'no-store' });
    repo = await repoResponse.json();

    if (repo.permissions && repo.permissions.push === false) {
      throw new Error(`A conta ${user.login} consegue visualizar o repositório, mas não possui permissão de gravação nele.`);
    }

    stage = `acesso à branch ${config.branch}`;
    await githubFetch(`${apiBase}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/branches/${encodeURIComponent(config.branch)}`, { headers: headers(true), cache: 'no-store' });

    if (writeTest) {
      stage = `gravação de dados/conexao.json na branch ${config.branch}`;
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
      canWrite: true,
      repositoryPermissions: repo.permissions || null
    };
  } catch (error) {
    const accountInfo = user?.login ? ` Conta autenticada pelo token: ${user.login}.` : '';
    const githubDetail = error.detail ? ` Resposta do GitHub: ${error.detail}.` : '';
    const expectedPermission = error.acceptedPermissions ? ` Permissão exigida: ${error.acceptedPermissions}.` : '';
    const repositoryPermission = repo?.permissions ? ` Permissões da conta no repositório: push=${Boolean(repo.permissions.push)}, admin=${Boolean(repo.permissions.admin)}.` : '';
    const message = `Falha na etapa de ${stage}.${accountInfo} ${error.message || 'O GitHub recusou a operação.'}${githubDetail}${expectedPermission}${repositoryPermission}`;
    const detailedError = Object.assign(new Error(message), error);
    detailedError.message = message;
    throw detailedError;
  } finally {
    config = previousConfig;
  }
};
