'use strict';
(function preserveDetailedStateBeforeLegacyMigration() {
  const key = 'sep-certificacao-controle-v1';
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Number(parsed?.version || 0) >= 3 && Array.isArray(parsed?.activities) && parsed.activities.every(item => Array.isArray(item.branchItems))) {
      parsed.version = 2;
      localStorage.setItem(key, JSON.stringify(parsed));
    }
  } catch (_) { /* mantém o fluxo normal */ }
})();