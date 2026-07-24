'use strict';
(function keepDetailedActionsCompatibleWithBaseLoader() {
  const persistCompatibleVersion = () => {
    state.version = 2;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  };
  persistCompatibleVersion();
  const detailedSaveState = saveState;
  saveState = function compatibleDetailedSave(message = 'Alterações salvas') {
    detailedSaveState(message);
    persistCompatibleVersion();
  };
})();