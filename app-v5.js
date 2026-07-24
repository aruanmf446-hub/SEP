'use strict';

(function applyDetailedBranchActions() {
  const baseCreateInitialState = createInitialState;
  const baseDefaultBranchItem = defaultBranchItem;
  const baseMigrateState = migrateState;
  const baseOpenActivityForm = openActivityForm;
  const branchOpenState = new Map();
  const actionOpenState = new Map();

  function actionKey(branchId, actionId) { return `${branchId}:${actionId}`; }

  function defaultBranchAction(index = 0, dueDate = '') {
    return { id: uid(), title: '', department: '', responsibleId: '', status: 'Não iniciado', progress: 0, dueDate, pendingFrom: '', blocker: '', evidence: '', notes: '', updatedAt: nowIso() };
  }

  function normalizeBranchAction(action, index = 0, dueDate = '') {
    const normalized = { ...defaultBranchAction(index, dueDate), ...(action || {}) };
    normalized.progress = Math.max(0, Math.min(100, Number(normalized.progress || 0)));
    if (normalized.status === 'Concluído') normalized.progress = 100;
    if (normalized.progress === 100) normalized.status = 'Concluído';
    return normalized;
  }

  function actionIsCompleted(action) { return action?.status === 'Concluído' || Number(action?.progress || 0) >= 100; }

  function syncBranchItemFromActions(item) {
    item.actions = Array.isArray(item.actions) ? item.actions.map((action, index) => normalizeBranchAction(action, index, item.dueDate || '')) : [];
    if (!item.actions.length) return item;
    item.progress = average(item.actions.map(action => actionIsCompleted(action) ? 100 : Number(action.progress || 0)));
    if (item.actions.every(actionIsCompleted)) item.status = 'Concluído';
    else if (item.actions.some(action => action.status === 'Bloqueado')) item.status = 'Bloqueado';
    else if (item.actions.some(action => action.status === 'Aguardando retorno')) item.status = 'Aguardando retorno';
    else if (item.actions.some(action => action.status === 'Em andamento' || actionIsCompleted(action) || Number(action.progress || 0) > 0)) item.status = 'Em andamento';
    else item.status = 'Não iniciado';
    item.updatedAt = nowIso();
    return item;
  }

  function upgradeState(parsed) {
    const migrated = parsed && Number(parsed.version || 0) >= 3 && Array.isArray(parsed.branches) && Array.isArray(parsed.people) && Array.isArray(parsed.activities) ? parsed : baseMigrateState(parsed);
    return {
      ...migrated,
      version: 3,
      activities: (migrated.activities || []).map(control => ({
        ...control,
        branchItems: (control.branchItems || []).map(branchItem => syncBranchItemFromActions({ ...baseDefaultBranchItem(branchItem.branchId, branchItem.dueDate || control.dueDate || ''), ...branchItem, actions: Array.isArray(branchItem.actions) ? branchItem.actions : [] }))
      })),
      meta: migrated.meta || { createdAt: nowIso(), updatedAt: nowIso() }
    };
  }

  createInitialState = function createInitialStateV3() { return { ...baseCreateInitialState(), version: 3 }; };
  defaultBranchItem = function defaultBranchItemV3(branchId, dueDate = '') { return { ...baseDefaultBranchItem(branchId, dueDate), actions: [] }; };
  migrateState = upgradeState;
  state = upgradeState(state);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

  saveState = function saveStateV3(message = 'Alterações salvas') {
    state.version = 3;
    state.activities = (state.activities || []).map(control => ({ ...control, branchItems: (control.branchItems || []).map(item => syncBranchItemFromActions(item)) }));
    state.meta = state.meta || {};
    state.meta.updatedAt = nowIso();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    renderAll();
    if (message) showToast(message);
  };

  function branchActionMetrics(item) {
    const actions = item.actions || [];
    const completed = actions.filter(actionIsCompleted).length;
    return { total: actions.length, completed, pending: Math.max(0, actions.length - completed), progress: actions.length ? average(actions.map(action => actionIsCompleted(action) ? 100 : Number(action.progress || 0))) : Number(item.progress || 0), allCompleted: actions.length > 0 && completed === actions.length };
  }

  function actionOwnerText(action) { return [action.department, personName(action.responsibleId)].filter(value => value && value !== 'Não definido').join(' · ') || 'Sem área ou responsável'; }

  function readonlyBranchSummary(item, metrics) {
    return `<div class="branch-calculated-summary"><div><span>Status calculado</span><strong>${escapeHTML(item.status)}</strong></div><div><span>Progresso pelas ações</span><strong>${metrics.progress}%</strong></div><div><span>Ações concluídas</span><strong>${metrics.completed}/${metrics.total}</strong></div></div>`;
  }

  function simpleBranchFields(branch, item) {
    return `<div class="branch-execution-grid"><div class="field"><label>Status</label><select data-branch-field="status" data-branch-id="${branch.id}">${statusOptions(item.status)}</select></div><div class="field"><label>Responsável geral</label><select data-branch-field="responsibleId" data-branch-id="${branch.id}">${personOptions(item.responsibleId)}</select></div><div class="field progress-field"><label>Progresso <strong data-progress-label="${branch.id}">${Number(item.progress || 0)}%</strong></label><input type="range" min="0" max="100" step="5" value="${Number(item.progress || 0)}" data-branch-field="progress" data-branch-id="${branch.id}"></div><div class="field"><label>Prazo da filial</label><input type="date" value="${escapeHTML(item.dueDate || '')}" data-branch-field="dueDate" data-branch-id="${branch.id}"></div><div class="field span-2"><label>Pendente de retorno de</label><input value="${escapeHTML(item.pendingFrom || '')}" placeholder="Nome, setor ou contato" data-branch-field="pendingFrom" data-branch-id="${branch.id}"></div></div>`;
  }

  function generalBranchFields(branch, item, metrics) {
    return `${metrics.total ? readonlyBranchSummary(item, metrics) : simpleBranchFields(branch, item)}<div class="branch-execution-grid branch-general-grid">${metrics.total ? `<div class="field"><label>Responsável geral da filial</label><select data-branch-field="responsibleId" data-branch-id="${branch.id}">${personOptions(item.responsibleId)}</select></div><div class="field"><label>Prazo geral da filial</label><input type="date" value="${escapeHTML(item.dueDate || '')}" data-branch-field="dueDate" data-branch-id="${branch.id}"></div><div class="field span-2"><label>Pendente geral de retorno de</label><input value="${escapeHTML(item.pendingFrom || '')}" placeholder="Nome, setor ou contato" data-branch-field="pendingFrom" data-branch-id="${branch.id}"></div>` : ''}</div><details class="branch-details" ${item.blocker || item.evidence || item.notes ? 'open' : ''}><summary>Bloqueios, evidências e próxima ação geral</summary><div class="branch-detail-grid"><div class="field"><label>O que está pegando / bloqueio</label><textarea rows="3" placeholder="Documento, evidência ou impedimento" data-branch-field="blocker" data-branch-id="${branch.id}">${escapeHTML(item.blocker || '')}</textarea></div><div class="field"><label>O que já tenho / evidências</label><textarea rows="3" placeholder="Itens já recebidos ou concluídos" data-branch-field="evidence" data-branch-id="${branch.id}">${escapeHTML(item.evidence || '')}</textarea></div><div class="field span-2"><label>Próxima ação / observações</label><textarea rows="3" placeholder="Cobrança, visita, envio ou ação necessária" data-branch-field="notes" data-branch-id="${branch.id}">${escapeHTML(item.notes || '')}</textarea></div></div></details>`;
  }

  function renderBranchAction(branch, item, action, index) {
    const completed = actionIsCompleted(action);
    const key = actionKey(branch.id, action.id);
    if (!actionOpenState.has(key)) actionOpenState.set(key, !completed);
    if (completed) actionOpenState.set(key, false);
    const open = actionOpenState.get(key);
    const palette = STATUS_COLORS[action.status] || STATUS_COLORS['Não iniciado'];
    const displayTitle = action.title || action.department || `Ação ${index + 1}`;
    return `<details class="branch-action-card ${completed ? 'completed' : ''}" data-action-details data-branch-id="${branch.id}" data-action-id="${action.id}" ${open ? 'open' : ''}><summary class="branch-action-summary"><span class="action-check-wrap" title="Marcar ação como concluída"><input type="checkbox" data-action-complete data-branch-id="${branch.id}" data-action-id="${action.id}" ${completed ? 'checked' : ''}></span><span class="action-summary-main"><strong>${escapeHTML(displayTitle)}</strong><small>${escapeHTML(actionOwnerText(action))}</small></span><span class="action-progress-compact">${Number(action.progress || 0)}%</span><span class="branch-status-dot action-status-dot" style="--status-color:${palette.color};--status-soft:${palette.soft}">${escapeHTML(action.status)}</span><span class="accordion-chevron" aria-hidden="true">⌄</span></summary><div class="branch-action-body"><div class="branch-action-grid"><div class="field span-2"><label>Ação / entrega *</label><input value="${escapeHTML(action.title || '')}" placeholder="Ex.: Enviar evidência da organização da oficina" data-action-field="title" data-branch-id="${branch.id}" data-action-id="${action.id}"></div><div class="field"><label>Área / departamento</label><input value="${escapeHTML(action.department || '')}" placeholder="Ex.: Oficina, Estoque ou Vendas" data-action-field="department" data-branch-id="${branch.id}" data-action-id="${action.id}"></div><div class="field"><label>Responsável</label><select data-action-field="responsibleId" data-branch-id="${branch.id}" data-action-id="${action.id}">${personOptions(action.responsibleId)}</select></div><div class="field"><label>Status</label><select data-action-field="status" data-branch-id="${branch.id}" data-action-id="${action.id}">${statusOptions(action.status)}</select></div><div class="field action-progress-field"><label>Progresso <strong data-action-progress-label="${branch.id}:${action.id}">${Number(action.progress || 0)}%</strong></label><input type="range" min="0" max="100" step="5" value="${Number(action.progress || 0)}" data-action-field="progress" data-branch-id="${branch.id}" data-action-id="${action.id}"></div><div class="field"><label>Prazo da ação</label><input type="date" value="${escapeHTML(action.dueDate || '')}" data-action-field="dueDate" data-branch-id="${branch.id}" data-action-id="${action.id}"></div><div class="field"><label>Pendente de retorno de</label><input value="${escapeHTML(action.pendingFrom || '')}" placeholder="Pessoa, setor ou contato" data-action-field="pendingFrom" data-branch-id="${branch.id}" data-action-id="${action.id}"></div></div><details class="action-detail-notes" ${action.blocker || action.evidence || action.notes ? 'open' : ''}><summary>Bloqueios, evidências e próxima ação</summary><div class="branch-detail-grid"><div class="field"><label>Bloqueio / o que está pegando</label><textarea rows="3" placeholder="Documento, pendência ou impedimento" data-action-field="blocker" data-branch-id="${branch.id}" data-action-id="${action.id}">${escapeHTML(action.blocker || '')}</textarea></div><div class="field"><label>Evidências / o que já tenho</label><textarea rows="3" placeholder="Itens já recebidos ou concluídos" data-action-field="evidence" data-branch-id="${branch.id}" data-action-id="${action.id}">${escapeHTML(action.evidence || '')}</textarea></div><div class="field span-2"><label>Próxima ação / observações</label><textarea rows="3" placeholder="Cobrança, visita, envio ou ação necessária" data-action-field="notes" data-branch-id="${branch.id}" data-action-id="${action.id}">${escapeHTML(action.notes || '')}</textarea></div></div></details><div class="action-footer"><span>Atualizado ${formatDateTime(action.updatedAt)}</span><button type="button" class="text-button action-delete" data-delete-action data-branch-id="${branch.id}" data-action-id="${action.id}">Excluir ação</button></div></div></details>`;
  }

  renderBranchExecutionList = function renderDetailedBranchExecutionList() {
    const selectedBranches = state.branches.filter(branch => editingSelectedBranches.has(branch.id));
    $('selectedBranchCount').textContent = `${selectedBranches.length} ${selectedBranches.length === 1 ? 'filial' : 'filiais'}`;
    $('branchExecutionList').innerHTML = selectedBranches.length ? selectedBranches.map(branch => {
      const item = editingBranchItems.get(branch.id) || defaultBranchItem(branch.id, $('activityDueDate').value);
      syncBranchItemFromActions(item);
      editingBranchItems.set(branch.id, item);
      const metrics = branchActionMetrics(item);
      const palette = STATUS_COLORS[item.status] || STATUS_COLORS['Não iniciado'];
      if (!branchOpenState.has(branch.id)) branchOpenState.set(branch.id, !metrics.allCompleted);
      if (metrics.allCompleted) branchOpenState.set(branch.id, false);
      const branchOpen = branchOpenState.get(branch.id);
      const initials = branch.name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
      const sortedActions = [...(item.actions || [])].sort((a, b) => Number(actionIsCompleted(a)) - Number(actionIsCompleted(b)));
      return `<details class="branch-execution-card branch-accordion ${metrics.allCompleted ? 'all-completed' : ''}" data-branch-details data-branch-card="${branch.id}" ${branchOpen ? 'open' : ''}><summary class="branch-execution-header branch-accordion-summary"><div class="branch-title-block"><div class="branch-avatar-small">${escapeHTML(initials || 'F')}</div><div><h4>${escapeHTML(branch.name)}</h4><p>${escapeHTML([branch.code, branch.region].filter(Boolean).join(' · ') || 'Filial')}</p></div></div><div class="branch-summary-progress"><span>${metrics.total ? `${metrics.completed} de ${metrics.total} ações` : 'Sem ações detalhadas'}</span><div class="branch-mini-progress"><i style="width:${metrics.progress}%"></i></div><strong>${metrics.progress}%</strong></div><span class="branch-status-dot" style="--status-color:${palette.color};--status-soft:${palette.soft}">${escapeHTML(item.status)}</span><span class="accordion-chevron" aria-hidden="true">⌄</span></summary><div class="branch-accordion-body"><details class="branch-overview" ${!metrics.total ? 'open' : ''}><summary>Resumo geral da filial</summary><div class="branch-overview-body">${generalBranchFields(branch, item, metrics)}</div></details><section class="branch-actions-section"><div class="branch-actions-heading"><div><span class="panel-kicker">Andamentos detalhados</span><h4>Ações por área, departamento ou pessoa</h4><p>As ações concluídas são recolhidas automaticamente e movidas para o final.</p></div><button type="button" class="button secondary compact-action-button" data-add-action="${branch.id}">+ Nova ação</button></div><div class="branch-action-list">${sortedActions.length ? sortedActions.map((action, index) => renderBranchAction(branch, item, action, index)).join('') : `<div class="action-empty-state"><strong>Nenhuma ação detalhada</strong><span>Adicione Oficina, Estoque, Vendas ou qualquer entrega que precise acompanhar separadamente.</span><button type="button" class="button primary compact-action-button" data-add-action="${branch.id}">Adicionar primeira ação</button></div>`}</div></section></div></details>`;
    }).join('') : emptyState('Selecione pelo menos uma filial', 'As filiais marcadas acima aparecerão aqui para preenchimento.');
  };

  openActivityForm = function openDetailedActivityForm(activityId = '') { branchOpenState.clear(); actionOpenState.clear(); baseOpenActivityForm(activityId); };

  function findEditingAction(branchId, actionId) {
    const item = editingBranchItems.get(branchId);
    if (!item) return {};
    item.actions = Array.isArray(item.actions) ? item.actions : [];
    return { item, action: item.actions.find(entry => entry.id === actionId) };
  }

  function addAction(branchId) {
    const item = editingBranchItems.get(branchId) || defaultBranchItem(branchId, $('activityDueDate').value);
    item.actions = Array.isArray(item.actions) ? item.actions : [];
    const action = defaultBranchAction(item.actions.length, item.dueDate || $('activityDueDate').value);
    item.actions.push(action);
    syncBranchItemFromActions(item);
    editingBranchItems.set(branchId, item);
    branchOpenState.set(branchId, true);
    actionOpenState.set(actionKey(branchId, action.id), true);
    renderBranchExecutionList();
    window.setTimeout(() => document.querySelector(`[data-action-field="title"][data-action-id="${CSS.escape(action.id)}"]`)?.focus(), 30);
  }

  function completeAction(branchId, actionId, completed) {
    const { item, action } = findEditingAction(branchId, actionId);
    if (!item || !action) return;
    if (completed) { action.status = 'Concluído'; action.progress = 100; actionOpenState.set(actionKey(branchId, actionId), false); }
    else { action.status = 'Em andamento'; if (Number(action.progress || 0) >= 100) action.progress = 0; actionOpenState.set(actionKey(branchId, actionId), true); branchOpenState.set(branchId, true); }
    action.updatedAt = nowIso();
    syncBranchItemFromActions(item);
    if (branchActionMetrics(item).allCompleted) branchOpenState.set(branchId, false);
    editingBranchItems.set(branchId, item);
    renderBranchExecutionList();
    showToast(completed ? 'Ação concluída e recolhida.' : 'Ação reaberta.');
  }

  function deleteAction(branchId, actionId) {
    const item = editingBranchItems.get(branchId);
    if (!item) return;
    const action = (item.actions || []).find(entry => entry.id === actionId);
    if (!action || !confirm(`Excluir a ação “${action.title || action.department || 'sem título'}”?`)) return;
    item.actions = (item.actions || []).filter(entry => entry.id !== actionId);
    actionOpenState.delete(actionKey(branchId, actionId));
    syncBranchItemFromActions(item);
    editingBranchItems.set(branchId, item);
    renderBranchExecutionList();
  }

  function updateActionField(field, shouldRender = false) {
    const branchId = field.dataset.branchId;
    const actionId = field.dataset.actionId;
    const key = field.dataset.actionField;
    const { item, action } = findEditingAction(branchId, actionId);
    if (!item || !action) return;
    action[key] = key === 'progress' ? Number(field.value) : field.value;
    action.updatedAt = nowIso();
    if (key === 'status' && action.status === 'Concluído') { action.progress = 100; actionOpenState.set(actionKey(branchId, actionId), false); shouldRender = true; }
    if (key === 'progress') {
      const label = document.querySelector(`[data-action-progress-label="${CSS.escape(`${branchId}:${actionId}`)}"]`);
      if (label) label.textContent = `${action.progress}%`;
      if (Number(action.progress) === 100) { action.status = 'Concluído'; actionOpenState.set(actionKey(branchId, actionId), false); shouldRender = true; }
      else if (action.status === 'Concluído') action.status = Number(action.progress) > 0 ? 'Em andamento' : 'Não iniciado';
    }
    syncBranchItemFromActions(item);
    editingBranchItems.set(branchId, item);
    if (shouldRender) renderBranchExecutionList();
  }

  const branchList = $('branchExecutionList');
  branchList.addEventListener('click', event => {
    const checkbox = event.target.closest('[data-action-complete]');
    if (checkbox) event.stopPropagation();
    const add = event.target.closest('[data-add-action]');
    if (add) { event.preventDefault(); addAction(add.dataset.addAction); return; }
    const remove = event.target.closest('[data-delete-action]');
    if (remove) { event.preventDefault(); deleteAction(remove.dataset.branchId, remove.dataset.actionId); }
  });
  branchList.addEventListener('change', event => {
    const checkbox = event.target.closest('[data-action-complete]');
    if (checkbox) { completeAction(checkbox.dataset.branchId, checkbox.dataset.actionId, checkbox.checked); return; }
    const field = event.target.closest('[data-action-field]');
    if (field) updateActionField(field, ['status', 'progress'].includes(field.dataset.actionField));
  });
  branchList.addEventListener('input', event => { const field = event.target.closest('[data-action-field]'); if (field) updateActionField(field, false); });
  branchList.addEventListener('toggle', event => {
    const branchDetails = event.target.closest('[data-branch-details]');
    if (branchDetails === event.target) branchOpenState.set(branchDetails.dataset.branchCard, branchDetails.open);
    const actionDetails = event.target.closest('[data-action-details]');
    if (actionDetails === event.target) actionOpenState.set(actionKey(actionDetails.dataset.branchId, actionDetails.dataset.actionId), actionDetails.open);
  }, true);

  renderPeople = function renderPeopleWithActions() {
    const rows = flattenExecutions();
    $('peopleCards').innerHTML = state.people.length ? state.people.map(person => {
      const assignedBranches = rows.filter(({ branchItem }) => branchItem.responsibleId === person.id);
      const assignedActions = rows.flatMap(({ branchItem, control }) => (branchItem.actions || []).filter(action => action.responsibleId === person.id).map(action => ({ action, branchItem, control })));
      const openActions = assignedActions.filter(({ action }) => !actionIsCompleted(action)).length;
      const openBranches = assignedBranches.filter(({ branchItem }) => branchItem.status !== 'Concluído').length;
      const initials = person.name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
      return `<article class="management-card"><div class="management-avatar">${escapeHTML(initials || 'R')}</div><div><h3>${escapeHTML(person.name)}</h3><p>${escapeHTML([person.role, person.contact].filter(Boolean).join(' · ') || 'Sem função ou contato')}</p><div class="management-stats"><span>${assignedActions.length} ações atribuídas</span><span>${openActions + openBranches} pendentes</span></div></div><button class="icon-button" data-edit-person="${person.id}" aria-label="Editar responsável">⋯</button></article>`;
    }).join('') : emptyState('Nenhum responsável cadastrado', 'Cadastre as pessoas que participam das rotinas.');
  };

  exportCsv = function exportDetailedCsv() {
    const columns = ['Checklist', 'Rotina', 'Ciclo', 'Prioridade', 'Filial', 'Ação', 'Área / departamento', 'Responsável', 'Status', 'Progresso', 'Prazo', 'Pendente de retorno de', 'Bloqueio', 'Evidências', 'Próxima ação / observações', 'Atualizado em'];
    const csvEscape = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const rows = [columns.map(csvEscape).join(';')];
    state.activities.forEach(control => (control.branchItems || []).forEach(item => {
      const actions = item.actions?.length ? item.actions : [null];
      actions.forEach(action => rows.push([control.title, control.routine, control.cycle, control.priority, branchName(item.branchId), action?.title || 'Resumo geral da filial', action?.department || '', personName(action?.responsibleId || item.responsibleId), action?.status || item.status, `${Number(action?.progress ?? item.progress ?? 0)}%`, formatDate(action?.dueDate || item.dueDate), action?.pendingFrom || item.pendingFrom, action?.blocker || item.blocker, action?.evidence || item.evidence, action?.notes || item.notes, formatDateTime(action?.updatedAt || item.updatedAt || control.updatedAt)].map(csvEscape).join(';')));
    }));
    const date = new Date().toISOString().slice(0, 10);
    downloadFile(`sep-relatorio-detalhado-${date}.csv`, `\ufeff${rows.join('\n')}`, 'text/csv;charset=utf-8');
    showToast('Relatório detalhado baixado');
  };
})();