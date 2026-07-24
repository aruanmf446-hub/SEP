'use strict';

// Integração de status com o GitHub Actions.
// O secret CHAVEY permanece protegido no ambiente gembraa; o front lê apenas
// o arquivo público de confirmação gravado pelo workflow na branch dados.
(function setupActionsBridge() {
  const ACTIONS_STATUS_URL = 'https://raw.githubusercontent.com/aruanmf446-hub/SEP/dados/dados/conexao-actions.json';

  // Leituras públicas da branch dados não devem enviar um token antigo salvo
  // no navegador. A autenticação local só é usada quando uma gravação direta
  // for explicitamente solicitada.
  headers = function safeGithubHeaders(requireAuth = false) {
    const result = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    if (requireAuth) {
      if (!config.token) throw new Error('A integração via CHAVEY está ativa no GitHub Actions. O navegador não possui acesso ao valor secreto.');
      result.Authorization = `Bearer ${config.token}`;
    }
    return result;
  };

  async function readActionsStatus() {
    const response = await fetch(`${ACTIONS_STATUS_URL}?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Status ${response.status}`);
    return response.json();
  }

  function applyConnectedState(status) {
    window.SEP_ACTIONS_CONNECTION = status;
    const button = document.getElementById('githubSettingsButton');
    if (button) {
      button.textContent = 'GitHub conectado';
      button.classList.add('github-actions-connected');
      button.title = `CHAVEY validada no ambiente ${status.environment}; conta ${status.authenticatedUser}; branch ${status.branch}.`;
    }

    const footer = document.querySelector('.sidebar-footer small');
    if (footer) footer.textContent = `CHAVEY ativa · ${status.authenticatedUser} · branch ${status.branch}`;
  }

  const originalOpenGithubSettings = openGithubSettings;
  openGithubSettings = function openGithubActionsStatus() {
    if (window.SEP_ACTIONS_CONNECTION) {
      const status = window.SEP_ACTIONS_CONNECTION;
      showToast(`CHAVEY validada via GitHub Actions. Conta ${status.authenticatedUser}; repositório ${status.repository}; branch ${status.branch}.`);
      return;
    }
    originalOpenGithubSettings();
  };

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      const status = await readActionsStatus();
      if (status?.secretName === 'CHAVEY' && status?.environment === 'gembraa') {
        applyConnectedState(status);
      }
    } catch (_) {
      // Se o status ainda não estiver disponível, mantém o fluxo de diagnóstico.
    }
  });
})();
