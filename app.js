'use strict';

const STORAGE_KEY = 'sep-certificacao-controle-v1';
const ROUTINES = ['Separação de Marcas', 'Checklist Gemba', 'Certificação / Auditoria', 'Plano de Ação', 'Outra rotina'];
const STATUSES = ['Não iniciado', 'Em andamento', 'Aguardando retorno', 'Bloqueado', 'Concluído'];
const STATUS_COLORS = {
  'Não iniciado': { color: '#7c899d', soft: '#edf1f6' },
  'Em andamento': { color: '#2e65f3', soft: '#e9efff' },
  'Aguardando retorno': { color: '#c98305', soft: '#fff4d8' },
  'Bloqueado': { color: '#d84a4a', soft: '#ffebeb' },
  'Concluído': { color: '#22a06b', soft: '#e5f6ee' }
};
const VIEW_META = {
  dashboard: ['Visão geral', 'Dashboard de andamento'],
  activities: ['Controle centralizado', 'Checklists e rotinas'],
  branches: ['Estrutura', 'Filiais'],
  people: ['Contatos', 'Responsáveis'],
  data: ['Segurança dos dados', 'Dados e backup']
};

const nowIso = () => new Date().toISOString();
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const $ = id => document.getElementById(id);

function createInitialState() {
  return {
    version: 2,
    branches: Array.from({ length: 9 }, (_, index) => ({
      id: uid(),
      name: `Filial ${String(index + 1).padStart(2, '0')}`,
      code: `F${String(index + 1).padStart(2, '0')}`,
      region: ''
    })),
    people: [],
    activities: [],
    meta: { createdAt: nowIso(), updatedAt: nowIso() }
  };
}

function defaultBranchItem(branchId, dueDate = '') {
  return {
    branchId,
    status: 'Não iniciado',
    progress: 0,
    responsibleId: '',
    dueDate,
    pendingFrom: '',
    blocker: '',
    evidence: '',
    notes: '',
    updatedAt: nowIso()
  };
}

function migrateState(parsed) {
  if (!parsed || !Array.isArray(parsed.branches) || !Array.isArray(parsed.people) || !Array.isArray(parsed.activities)) {
    throw new Error('Estrutura inválida');
  }

  if (parsed.version === 2 && parsed.activities.every(item => Array.isArray(item.branchItems))) {
    return {
      ...parsed,
      version: 2,
      activities: parsed.activities.map(item => ({
        ...item,
        description: item.description || '',
        branchItems: item.branchItems.map(branchItem => ({
          ...defaultBranchItem(branchItem.branchId, branchItem.dueDate || item.dueDate || ''),
          ...branchItem
        }))
      })),
      meta: parsed.meta || { createdAt: nowIso(), updatedAt: nowIso() }
    };
  }

  const grouped = new Map();
  parsed.activities.forEach(oldItem => {
    const key = [oldItem.title, oldItem.routine, oldItem.cycle].map(value => String(value || '').trim().toLowerCase()).join('|');
    if (!grouped.has(key)) {
      grouped.set(key, {
        id: oldItem.id || uid(),
        title: oldItem.title || 'Checklist sem título',
        routine: oldItem.routine || ROUTINES[0],
        cycle: oldItem.cycle || '',
        priority: oldItem.priority || 'Média',
        dueDate: oldItem.dueDate || '',
        description: '',
        branchItems: [],
        createdAt: oldItem.createdAt || nowIso(),
        updatedAt: oldItem.updatedAt || nowIso()
      });
    }
    const control = grouped.get(key);
    if (oldItem.branchId && !control.branchItems.some(item => item.branchId === oldItem.branchId)) {
      control.branchItems.push({
        branchId: oldItem.branchId,
        status: oldItem.status || 'Não iniciado',
        progress: Number(oldItem.progress || 0),
        responsibleId: oldItem.responsibleId || '',
        dueDate: oldItem.dueDate || '',
        pendingFrom: oldItem.pendingFrom || '',
        blocker: oldItem.blocker || '',
        evidence: oldItem.evidence || '',
        notes: oldItem.notes || '',
        updatedAt: oldItem.updatedAt || nowIso()
      });
    }
  });

  return {
    ...parsed,
    version: 2,
    activities: [...grouped.values()],
    meta: { ...(parsed.meta || {}), migratedAt: nowIso(), updatedAt: nowIso() }
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const migrated = migrateState(JSON.parse(raw));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    return migrated;
  } catch (error) {
    console.warn('Falha ao carregar dados locais:', error);
    return createInitialState();
  }
}

let state = loadState();
let currentView = 'dashboard';
let activityLayout = 'cards';
let editingBranchItems = new Map();
let editingSelectedBranches = new Set();

function saveState(message = 'Alterações salvas') {
  state.version = 2;
  state.meta = state.meta || {};
  state.meta.updatedAt = nowIso();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderAll();
  if (message) showToast(message);
}

function escapeHTML(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function average(values) {
  return values.length ? Math.round(values.reduce((sum, item) => sum + Number(item || 0), 0) / values.length) : 0;
}

function getBranch(id) { return state.branches.find(item => item.id === id); }
function getPerson(id) { return state.people.find(item => item.id === id); }
function branchName(id) { return getBranch(id)?.name || 'Filial não informada'; }
function personName(id) { return getPerson(id)?.name || 'Não definido'; }
function priorityWeight(priority) { return ({ Crítica: 4, Alta: 3, Média: 2, Baixa: 1 })[priority] || 0; }

function formatDate(value) {
  if (!value) return 'Sem prazo';
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function formatDateTime(value) {
  if (!value) return 'Ainda não atualizado';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function isBranchItemOverdue(branchItem) {
  if (!branchItem?.dueDate || branchItem.status === 'Concluído') return false;
  return new Date(`${branchItem.dueDate}T23:59:59`).getTime() < Date.now();
}

function statusBadge(status) {
  const palette = STATUS_COLORS[status] || STATUS_COLORS['Não iniciado'];
  return `<span class="status-badge" style="--badge-bg:${palette.soft};--badge-color:${palette.color}">${escapeHTML(status)}</span>`;
}

function controlStatus(control) {
  const items = control.branchItems || [];
  if (!items.length) return 'Não iniciado';
  if (items.every(item => item.status === 'Concluído')) return 'Concluído';
  if (items.some(item => item.status === 'Bloqueado')) return 'Bloqueado';
  if (items.some(item => item.status === 'Aguardando retorno')) return 'Aguardando retorno';
  if (items.some(item => item.status === 'Em andamento' || item.status === 'Concluído' || Number(item.progress) > 0)) return 'Em andamento';
  return 'Não iniciado';
}

function controlProgress(control) { return average((control.branchItems || []).map(item => item.progress)); }
function controlOverdueCount(control) { return (control.branchItems || []).filter(isBranchItemOverdue).length; }
function controlPendingCount(control) { return (control.branchItems || []).filter(item => item.status !== 'Concluído').length; }
function controlCompletedCount(control) { return (control.branchItems || []).filter(item => item.status === 'Concluído').length; }

function flattenExecutions(controls = state.activities) {
  return controls.flatMap(control => (control.branchItems || []).map(branchItem => ({ control, branchItem })));
}

function showToast(message, type = '') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`.trim();
  toast.textContent = message;
  $('toastContainer').appendChild(toast);
  window.setTimeout(() => toast.remove(), 3000);
}

function setOptions(select, entries, allLabel, selectedValue = select.value) {
  const options = [];
  if (allLabel !== null) options.push(`<option value="">${escapeHTML(allLabel)}</option>`);
  entries.forEach(entry => {
    const value = typeof entry === 'string' ? entry : entry.value;
    const label = typeof entry === 'string' ? entry : entry.label;
    options.push(`<option value="${escapeHTML(value)}">${escapeHTML(label)}</option>`);
  });
  select.innerHTML = options.join('');
  if ([...select.options].some(option => option.value === selectedValue)) select.value = selectedValue;
}

function getCycles() {
  return [...new Set(state.activities.map(item => item.cycle).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function hydrateOptions() {
  const branchEntries = state.branches.map(item => ({ value: item.id, label: item.name }));
  const cycles = getCycles();
  setOptions($('dashboardRoutineFilter'), ROUTINES, 'Todas as rotinas');
  setOptions($('dashboardBranchFilter'), branchEntries, 'Todas as filiais');
  setOptions($('dashboardCycleFilter'), cycles, 'Todos os ciclos');
  setOptions($('activityRoutineFilter'), ROUTINES, 'Todas as rotinas');
  setOptions($('activityStatusFilter'), STATUSES, 'Todos os status');
  setOptions($('activityBranchFilter'), branchEntries, 'Todas as filiais');
  setOptions($('activityCycleFilter'), cycles, 'Todos os ciclos');
  setOptions($('activityRoutine'), ROUTINES, null);
}

function dashboardControls() {
  const routine = $('dashboardRoutineFilter').value;
  const branch = $('dashboardBranchFilter').value;
  const cycle = $('dashboardCycleFilter').value;
  return state.activities.filter(control =>
    (!routine || control.routine === routine) &&
    (!cycle || control.cycle === cycle) &&
    (!branch || (control.branchItems || []).some(item => item.branchId === branch))
  );
}

function dashboardExecutions() {
  const branch = $('dashboardBranchFilter').value;
  return flattenExecutions(dashboardControls()).filter(({ branchItem }) => !branch || branchItem.branchId === branch);
}

function renderDashboard() {
  const controls = dashboardControls();
  const executions = dashboardExecutions();
  const counts = Object.fromEntries(STATUSES.map(status => [status, executions.filter(({ branchItem }) => branchItem.status === status).length]));
  const overdue = executions.filter(({ branchItem }) => isBranchItemOverdue(branchItem)).length;
  const progress = average(executions.map(({ branchItem }) => branchItem.progress));
  const uniqueBranches = new Set(executions.map(({ branchItem }) => branchItem.branchId)).size;
  const kpis = [
    { label: 'Checklists', value: controls.length, detail: 'controles centralizados', accent: '#2e65f3', soft: '#e9efff' },
    { label: 'Filiais no escopo', value: uniqueBranches, detail: 'unidades acompanhadas', accent: '#18a7b8', soft: '#e5f7fa' },
    { label: 'Filiais concluídas', value: counts['Concluído'], detail: 'execuções finalizadas', accent: '#22a06b', soft: '#e5f6ee' },
    { label: 'Aguardando retorno', value: counts['Aguardando retorno'], detail: 'dependem de resposta', accent: '#c98305', soft: '#fff4d8' },
    { label: 'Bloqueadas / atrasadas', value: counts['Bloqueado'] + overdue, detail: `${overdue} com prazo vencido`, accent: '#d84a4a', soft: '#ffebeb' },
    { label: 'Progresso médio', value: `${progress}%`, detail: 'média por filial', accent: '#7a5cf0', soft: '#f0ecff' }
  ];
  $('kpiGrid').innerHTML = kpis.map(item => `<article class="kpi-card" style="--accent:${item.accent};--accent-soft:${item.soft}"><span class="kpi-accent"></span><span class="kpi-label">${item.label}</span><strong>${item.value}</strong><small>${item.detail}</small></article>`).join('');

  $('routineProgressChart').innerHTML = ROUTINES.map(routine => {
    const rows = executions.filter(({ control }) => control.routine === routine);
    const value = average(rows.map(({ branchItem }) => branchItem.progress));
    return `<div class="bar-row"><span class="bar-label" title="${escapeHTML(routine)}">${escapeHTML(routine)}</span><div class="bar-track"><div class="bar-fill" style="width:${value}%"></div></div><span class="bar-value">${value}%</span></div>`;
  }).join('');

  const total = executions.length;
  let current = 0;
  const gradientParts = [];
  STATUSES.forEach(status => {
    const part = total ? (counts[status] / total) * 100 : 0;
    const end = current + part;
    if (part > 0) gradientParts.push(`${STATUS_COLORS[status].color} ${current}% ${end}%`);
    current = end;
  });
  $('statusDonut').style.background = gradientParts.length ? `conic-gradient(${gradientParts.join(',')})` : 'conic-gradient(#e8edf4 0 100%)';
  $('donutTotal').textContent = total;
  $('statusLegend').innerHTML = STATUSES.map(status => `<div class="legend-item"><span class="legend-dot" style="--legend-color:${STATUS_COLORS[status].color}"></span><span>${escapeHTML(status)}</span><strong>${counts[status]}</strong></div>`).join('');

  const pending = executions
    .filter(({ branchItem }) => branchItem.status === 'Aguardando retorno' || branchItem.pendingFrom)
    .sort((a, b) => new Date(b.branchItem.updatedAt || b.control.updatedAt || 0) - new Date(a.branchItem.updatedAt || a.control.updatedAt || 0))
    .slice(0, 7);
  $('pendingReturns').innerHTML = pending.length ? pending.map(({ control, branchItem }) => `<button class="stack-item" data-edit-activity="${control.id}"><div><strong>${escapeHTML(branchItem.pendingFrom || branchName(branchItem.branchId))}</strong><p>${escapeHTML(control.title)} · ${escapeHTML(branchName(branchItem.branchId))}</p></div><div class="item-meta"><strong>${Number(branchItem.progress || 0)}%</strong><p>${escapeHTML(control.cycle || 'Sem ciclo')}</p></div></button>`).join('') : emptyState('Nenhum retorno pendente', 'As filiais aguardando resposta aparecerão aqui.');

  const attention = executions
    .filter(({ control, branchItem }) => branchItem.status === 'Bloqueado' || isBranchItemOverdue(branchItem) || ['Alta', 'Crítica'].includes(control.priority))
    .sort((a, b) => Number(isBranchItemOverdue(b.branchItem)) - Number(isBranchItemOverdue(a.branchItem)) || priorityWeight(b.control.priority) - priorityWeight(a.control.priority))
    .slice(0, 7);
  $('attentionList').innerHTML = attention.length ? attention.map(({ control, branchItem }) => `<button class="stack-item" data-edit-activity="${control.id}"><div><strong>${escapeHTML(control.title)}</strong><p>${escapeHTML(branchItem.blocker || (isBranchItemOverdue(branchItem) ? 'Prazo vencido' : `Prioridade ${control.priority || 'Média'}`))}</p></div><div class="item-meta"><strong>${escapeHTML(branchName(branchItem.branchId))}</strong><p>${formatDate(branchItem.dueDate)}</p></div></button>`).join('') : emptyState('Nenhum ponto crítico', 'Bloqueios, atrasos e prioridades altas aparecerão aqui.');

  const branchRows = state.branches.map(branch => {
    const rows = executions.filter(({ branchItem }) => branchItem.branchId === branch.id);
    return {
      branch,
      rows,
      concluded: rows.filter(({ branchItem }) => branchItem.status === 'Concluído').length,
      pending: rows.filter(({ branchItem }) => branchItem.status !== 'Concluído').length,
      progress: average(rows.map(({ branchItem }) => branchItem.progress))
    };
  }).filter(row => row.rows.length || !$('dashboardBranchFilter').value)
    .sort((a, b) => b.progress - a.progress || a.branch.name.localeCompare(b.branch.name, 'pt-BR'));
  $('branchSummaryBody').innerHTML = branchRows.length ? branchRows.map(row => `<tr><td><strong>${escapeHTML(row.branch.name)}</strong><br><small>${escapeHTML(row.branch.code || '')}</small></td><td>${row.rows.length}</td><td>${row.concluded}</td><td>${row.pending}</td><td><div class="table-progress"><div class="bar-track"><div class="bar-fill" style="width:${row.progress}%"></div></div><strong>${row.progress}%</strong></div></td></tr>`).join('') : '<tr><td colspan="5">Nenhuma filial encontrada para este filtro.</td></tr>';
  $('lastUpdate').textContent = `Atualizado em ${formatDateTime(state.meta?.updatedAt)}`;
}

function filteredActivities() {
  const query = normalize($('activitySearch').value);
  const routine = $('activityRoutineFilter').value;
  const status = $('activityStatusFilter').value;
  const branch = $('activityBranchFilter').value;
  const cycle = $('activityCycleFilter').value;
  return state.activities.filter(control => {
    const items = control.branchItems || [];
    const haystack = normalize([
      control.title, control.routine, control.cycle, control.description,
      ...items.flatMap(item => [branchName(item.branchId), personName(item.responsibleId), item.pendingFrom, item.blocker, item.evidence, item.notes])
    ].join(' '));
    return (!query || haystack.includes(query)) &&
      (!routine || control.routine === routine) &&
      (!status || items.some(item => item.status === status)) &&
      (!branch || items.some(item => item.branchId === branch)) &&
      (!cycle || control.cycle === cycle);
  }).sort((a, b) => {
    const rank = status => ({ Bloqueado: 0, 'Aguardando retorno': 1, 'Em andamento': 2, 'Não iniciado': 3, Concluído: 4 })[status] ?? 5;
    return rank(controlStatus(a)) - rank(controlStatus(b)) || priorityWeight(b.priority) - priorityWeight(a.priority) || new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
  });
}

function activityCard(control) {
  const items = control.branchItems || [];
  const progress = controlProgress(control);
  const completed = controlCompletedCount(control);
  const pending = controlPendingCount(control);
  const overdue = controlOverdueCount(control);
  const branchChips = items.slice(0, 4).map(item => `<span>${escapeHTML(branchName(item.branchId))}</span>`).join('');
  const extra = Math.max(0, items.length - 4);
  const firstAttention = items.find(item => item.status === 'Bloqueado' || item.pendingFrom || item.blocker || isBranchItemOverdue(item));
  return `<article class="activity-card checklist-card">
    <div class="activity-card-header"><span class="routine-label">${escapeHTML(control.routine)}</span>${statusBadge(controlStatus(control))}</div>
    <h3>${escapeHTML(control.title)}</h3>
    <p class="activity-subtitle">${escapeHTML(control.cycle || 'Sem ciclo')} · ${items.length} ${items.length === 1 ? 'filial' : 'filiais'}</p>
    <div class="activity-progress"><div class="activity-progress-head"><span>Progresso geral</span><strong>${progress}%</strong></div><div class="bar-track"><div class="bar-fill" style="width:${progress}%"></div></div></div>
    <div class="checklist-metrics"><div><strong>${items.length}</strong><span>Filiais</span></div><div><strong>${completed}</strong><span>Concluídas</span></div><div><strong>${pending}</strong><span>Pendentes</span></div><div class="${overdue ? 'metric-danger' : ''}"><strong>${overdue}</strong><span>Atrasadas</span></div></div>
    <div class="branch-chips">${branchChips}${extra ? `<span class="more-chip">+${extra}</span>` : ''}</div>
    ${firstAttention ? `<div class="activity-note"><strong>${escapeHTML(branchName(firstAttention.branchId))}:</strong> ${escapeHTML(firstAttention.blocker || firstAttention.pendingFrom || (isBranchItemOverdue(firstAttention) ? 'Prazo vencido' : firstAttention.notes))}</div>` : ''}
    <div class="card-actions"><span class="updated-at">Atualizado ${formatDateTime(control.updatedAt)}</span><button class="edit-button" data-edit-activity="${control.id}">Abrir checklist</button></div>
  </article>`;
}

function renderActivities() {
  const controls = filteredActivities();
  $('activityCount').textContent = `${controls.length} ${controls.length === 1 ? 'checklist' : 'checklists'}`;
  $('activityCards').innerHTML = controls.length ? controls.map(activityCard).join('') : emptyState('Nenhum checklist encontrado', 'Cadastre um checklist ou ajuste os filtros.');
  $('activityTableBody').innerHTML = controls.length ? controls.map(control => {
    const progress = controlProgress(control);
    const items = control.branchItems || [];
    return `<tr><td><strong>${escapeHTML(control.title)}</strong></td><td>${escapeHTML(control.routine)}</td><td>${escapeHTML(control.cycle || 'Sem ciclo')}</td><td>${items.length}</td><td>${controlCompletedCount(control)}</td><td>${controlPendingCount(control)}</td><td><div class="table-progress"><div class="bar-track"><div class="bar-fill" style="width:${progress}%"></div></div><strong>${progress}%</strong></div></td><td><button class="edit-button" data-edit-activity="${control.id}">Abrir</button></td></tr>`;
  }).join('') : '<tr><td colspan="8">Nenhum checklist encontrado.</td></tr>';
  $('activityCards').classList.toggle('hidden', activityLayout !== 'cards');
  $('activityTableContainer').classList.toggle('hidden', activityLayout !== 'table');
}

function renderBranches() {
  const rows = flattenExecutions();
  $('branchCards').innerHTML = state.branches.length ? state.branches.map(branch => {
    const items = rows.filter(({ branchItem }) => branchItem.branchId === branch.id);
    const progress = average(items.map(({ branchItem }) => branchItem.progress));
    const initials = branch.name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
    return `<article class="management-card"><div class="management-avatar">${escapeHTML(initials || 'F')}</div><div><h3>${escapeHTML(branch.name)}</h3><p>${escapeHTML([branch.code, branch.region].filter(Boolean).join(' · ') || 'Sem código ou região')}</p><div class="management-stats"><span>${items.length} checklists</span><span>${progress}% concluído</span></div></div><button class="icon-button" data-edit-branch="${branch.id}" aria-label="Editar filial">⋯</button></article>`;
  }).join('') : emptyState('Nenhuma filial cadastrada', 'Cadastre as unidades que participam das rotinas.');
}

function renderPeople() {
  const rows = flattenExecutions();
  $('peopleCards').innerHTML = state.people.length ? state.people.map(person => {
    const assigned = rows.filter(({ branchItem }) => branchItem.responsibleId === person.id);
    const open = assigned.filter(({ branchItem }) => branchItem.status !== 'Concluído').length;
    const initials = person.name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
    return `<article class="management-card"><div class="management-avatar">${escapeHTML(initials || 'R')}</div><div><h3>${escapeHTML(person.name)}</h3><p>${escapeHTML([person.role, person.contact].filter(Boolean).join(' · ') || 'Sem função ou contato')}</p><div class="management-stats"><span>${assigned.length} filiais atribuídas</span><span>${open} pendentes</span></div></div><button class="icon-button" data-edit-person="${person.id}" aria-label="Editar responsável">⋯</button></article>`;
  }).join('') : emptyState('Nenhum responsável cadastrado', 'Cadastre as pessoas que participam das rotinas.');
}

function emptyState(title, text) { return `<div class="empty-state"><strong>${escapeHTML(title)}</strong><span>${escapeHTML(text)}</span></div>`; }
function renderAll() { hydrateOptions(); renderDashboard(); renderActivities(); renderBranches(); renderPeople(); }

function navigate(view) {
  if (!VIEW_META[view]) return;
  currentView = view;
  document.querySelectorAll('.view').forEach(section => section.classList.toggle('active', section.id === `view-${view}`));
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  $('pageEyebrow').textContent = VIEW_META[view][0];
  $('pageTitle').textContent = VIEW_META[view][1];
  $('printDashboardButton').classList.toggle('hidden', view !== 'dashboard');
  $('sidebar').classList.remove('open');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openModal(id) {
  const modal = $(id);
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  window.setTimeout(() => modal.querySelector('input:not([type="hidden"]), select, textarea, button')?.focus(), 50);
}
function closeModal(id) { $(id).hidden = true; document.body.style.overflow = ''; }

function statusOptions(selected) {
  return STATUSES.map(status => `<option ${status === selected ? 'selected' : ''}>${escapeHTML(status)}</option>`).join('');
}
function personOptions(selected) {
  return `<option value="">Não definido</option>${state.people.map(person => `<option value="${person.id}" ${person.id === selected ? 'selected' : ''}>${escapeHTML(person.name)}</option>`).join('')}`;
}

function renderBranchSelection() {
  $('branchSelection').innerHTML = state.branches.length ? state.branches.map(branch => `<label class="branch-check ${editingSelectedBranches.has(branch.id) ? 'selected' : ''}"><input type="checkbox" data-select-branch="${branch.id}" ${editingSelectedBranches.has(branch.id) ? 'checked' : ''}><span class="branch-check-mark">✓</span><span><strong>${escapeHTML(branch.name)}</strong><small>${escapeHTML([branch.code, branch.region].filter(Boolean).join(' · ') || 'Sem código')}</small></span></label>`).join('') : emptyState('Nenhuma filial cadastrada', 'Cadastre uma filial antes de criar o checklist.');
}

function renderBranchExecutionList() {
  const selectedBranches = state.branches.filter(branch => editingSelectedBranches.has(branch.id));
  $('selectedBranchCount').textContent = `${selectedBranches.length} ${selectedBranches.length === 1 ? 'filial' : 'filiais'}`;
  $('branchExecutionList').innerHTML = selectedBranches.length ? selectedBranches.map(branch => {
    const item = editingBranchItems.get(branch.id) || defaultBranchItem(branch.id, $('activityDueDate').value);
    editingBranchItems.set(branch.id, item);
    const palette = STATUS_COLORS[item.status] || STATUS_COLORS['Não iniciado'];
    return `<article class="branch-execution-card" data-branch-card="${branch.id}">
      <div class="branch-execution-header"><div class="branch-title-block"><div class="branch-avatar-small">${escapeHTML(branch.name.slice(0, 2).toUpperCase())}</div><div><h4>${escapeHTML(branch.name)}</h4><p>${escapeHTML([branch.code, branch.region].filter(Boolean).join(' · ') || 'Filial')}</p></div></div><span class="branch-status-dot" style="--status-color:${palette.color};--status-soft:${palette.soft}">${escapeHTML(item.status)}</span></div>
      <div class="branch-execution-grid">
        <div class="field"><label>Status</label><select data-branch-field="status" data-branch-id="${branch.id}">${statusOptions(item.status)}</select></div>
        <div class="field"><label>Responsável</label><select data-branch-field="responsibleId" data-branch-id="${branch.id}">${personOptions(item.responsibleId)}</select></div>
        <div class="field progress-field"><label>Progresso <strong data-progress-label="${branch.id}">${Number(item.progress || 0)}%</strong></label><input type="range" min="0" max="100" step="5" value="${Number(item.progress || 0)}" data-branch-field="progress" data-branch-id="${branch.id}"></div>
        <div class="field"><label>Prazo da filial</label><input type="date" value="${escapeHTML(item.dueDate || '')}" data-branch-field="dueDate" data-branch-id="${branch.id}"></div>
        <div class="field span-2"><label>Pendente de retorno de</label><input value="${escapeHTML(item.pendingFrom || '')}" placeholder="Nome, setor ou contato" data-branch-field="pendingFrom" data-branch-id="${branch.id}"></div>
      </div>
      <details class="branch-details" ${item.blocker || item.evidence || item.notes ? 'open' : ''}>
        <summary>Bloqueios, evidências e próxima ação</summary>
        <div class="branch-detail-grid">
          <div class="field"><label>O que está pegando / bloqueio</label><textarea rows="3" placeholder="Documento, evidência ou impedimento" data-branch-field="blocker" data-branch-id="${branch.id}">${escapeHTML(item.blocker || '')}</textarea></div>
          <div class="field"><label>O que já tenho / evidências</label><textarea rows="3" placeholder="Itens já recebidos ou concluídos" data-branch-field="evidence" data-branch-id="${branch.id}">${escapeHTML(item.evidence || '')}</textarea></div>
          <div class="field span-2"><label>Próxima ação / observações</label><textarea rows="3" placeholder="Cobrança, visita, envio ou ação necessária" data-branch-field="notes" data-branch-id="${branch.id}">${escapeHTML(item.notes || '')}</textarea></div>
        </div>
      </details>
    </article>`;
  }).join('') : emptyState('Selecione pelo menos uma filial', 'As filiais marcadas acima aparecerão aqui para preenchimento.');
}

function openActivityForm(activityId = '') {
  $('activityForm').reset();
  $('activityId').value = '';
  $('activityModalTitle').textContent = 'Novo checklist';
  $('deleteActivityButton').hidden = true;
  $('activityPriority').value = 'Média';
  editingBranchItems = new Map();
  editingSelectedBranches = new Set();

  if (activityId) {
    const control = state.activities.find(item => item.id === activityId);
    if (!control) return;
    $('activityId').value = control.id;
    $('activityTitle').value = control.title || '';
    $('activityRoutine').value = control.routine || ROUTINES[0];
    $('activityCycle').value = control.cycle || '';
    $('activityPriority').value = control.priority || 'Média';
    $('activityDueDate').value = control.dueDate || '';
    $('activityDescription').value = control.description || '';
    (control.branchItems || []).forEach(item => {
      editingSelectedBranches.add(item.branchId);
      editingBranchItems.set(item.branchId, { ...defaultBranchItem(item.branchId, control.dueDate || ''), ...item });
    });
    $('activityModalTitle').textContent = 'Editar checklist';
    $('deleteActivityButton').hidden = false;
  } else {
    state.branches.forEach(branch => {
      editingSelectedBranches.add(branch.id);
      editingBranchItems.set(branch.id, defaultBranchItem(branch.id));
    });
  }

  renderBranchSelection();
  renderBranchExecutionList();
  openModal('activityModal');
}

function openBranchForm(branchId = '') {
  $('branchForm').reset();
  $('branchId').value = '';
  $('branchModalTitle').textContent = 'Nova filial';
  $('deleteBranchButton').hidden = true;
  if (branchId) {
    const branch = getBranch(branchId);
    if (!branch) return;
    $('branchId').value = branch.id;
    $('branchName').value = branch.name || '';
    $('branchCode').value = branch.code || '';
    $('branchRegion').value = branch.region || '';
    $('branchModalTitle').textContent = 'Editar filial';
    $('deleteBranchButton').hidden = false;
  }
  openModal('branchModal');
}

function openPersonForm(personId = '') {
  $('personForm').reset();
  $('personId').value = '';
  $('personModalTitle').textContent = 'Novo responsável';
  $('deletePersonButton').hidden = true;
  if (personId) {
    const person = getPerson(personId);
    if (!person) return;
    $('personId').value = person.id;
    $('personName').value = person.name || '';
    $('personRole').value = person.role || '';
    $('personContact').value = person.contact || '';
    $('personModalTitle').textContent = 'Editar responsável';
    $('deletePersonButton').hidden = false;
  }
  openModal('personModal');
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportBackup() {
  const date = new Date().toISOString().slice(0, 10);
  downloadFile(`sep-backup-${date}.json`, JSON.stringify(state, null, 2), 'application/json;charset=utf-8');
  showToast('Backup baixado com sucesso');
}

function exportCsv() {
  const columns = ['Checklist', 'Rotina', 'Ciclo', 'Prioridade', 'Filial', 'Responsável', 'Status', 'Progresso', 'Prazo', 'Pendente de retorno de', 'Bloqueio', 'Evidências', 'Próxima ação / observações', 'Atualizado em'];
  const csvEscape = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const rows = [columns.map(csvEscape).join(';')];
  state.activities.forEach(control => (control.branchItems || []).forEach(item => {
    rows.push([
      control.title, control.routine, control.cycle, control.priority, branchName(item.branchId), personName(item.responsibleId), item.status,
      `${Number(item.progress || 0)}%`, formatDate(item.dueDate), item.pendingFrom, item.blocker, item.evidence, item.notes, formatDateTime(item.updatedAt || control.updatedAt)
    ].map(csvEscape).join(';'));
  }));
  const date = new Date().toISOString().slice(0, 10);
  downloadFile(`sep-relatorio-${date}.csv`, `\ufeff${rows.join('\n')}`, 'text/csv;charset=utf-8');
  showToast('Relatório CSV baixado');
}

function bindEvents() {
  document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => navigate(button.dataset.view)));
  $('menuButton').addEventListener('click', () => $('sidebar').classList.toggle('open'));
  $('newActivityButton').addEventListener('click', () => openActivityForm());
  $('newBranchButton').addEventListener('click', () => openBranchForm());
  $('newPersonButton').addEventListener('click', () => openPersonForm());
  $('printDashboardButton').addEventListener('click', () => { navigate('dashboard'); window.print(); });

  document.querySelectorAll('[data-close-modal]').forEach(button => button.addEventListener('click', () => closeModal(button.dataset.closeModal)));
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => backdrop.addEventListener('click', event => { if (event.target === backdrop) closeModal(backdrop.id); }));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') document.querySelectorAll('.modal-backdrop:not([hidden])').forEach(modal => closeModal(modal.id)); });

  $('selectAllBranchesButton').addEventListener('click', () => {
    state.branches.forEach(branch => {
      editingSelectedBranches.add(branch.id);
      if (!editingBranchItems.has(branch.id)) editingBranchItems.set(branch.id, defaultBranchItem(branch.id, $('activityDueDate').value));
    });
    renderBranchSelection();
    renderBranchExecutionList();
  });
  $('clearBranchesButton').addEventListener('click', () => {
    editingSelectedBranches.clear();
    renderBranchSelection();
    renderBranchExecutionList();
  });
  $('activityDueDate').addEventListener('change', event => {
    editingSelectedBranches.forEach(branchId => {
      const item = editingBranchItems.get(branchId) || defaultBranchItem(branchId);
      if (!item.dueDate) item.dueDate = event.target.value;
      editingBranchItems.set(branchId, item);
    });
    renderBranchExecutionList();
  });

  $('branchSelection').addEventListener('change', event => {
    const checkbox = event.target.closest('[data-select-branch]');
    if (!checkbox) return;
    const branchId = checkbox.dataset.selectBranch;
    if (checkbox.checked) {
      editingSelectedBranches.add(branchId);
      if (!editingBranchItems.has(branchId)) editingBranchItems.set(branchId, defaultBranchItem(branchId, $('activityDueDate').value));
    } else {
      editingSelectedBranches.delete(branchId);
    }
    renderBranchSelection();
    renderBranchExecutionList();
  });

  const updateBranchField = event => {
    const field = event.target.closest('[data-branch-field]');
    if (!field) return;
    const branchId = field.dataset.branchId;
    const key = field.dataset.branchField;
    const item = editingBranchItems.get(branchId) || defaultBranchItem(branchId, $('activityDueDate').value);
    item[key] = key === 'progress' ? Number(field.value) : field.value;
    item.updatedAt = nowIso();
    if (key === 'status' && field.value === 'Concluído') item.progress = 100;
    if (key === 'progress') {
      if (Number(field.value) === 100) item.status = 'Concluído';
      else if (item.status === 'Concluído') item.status = Number(field.value) > 0 ? 'Em andamento' : 'Não iniciado';
    }
    editingBranchItems.set(branchId, item);
    if (key === 'progress' || key === 'status') {
      const card = field.closest('[data-branch-card]');
      const progressInput = card?.querySelector('[data-branch-field="progress"]');
      const statusInput = card?.querySelector('[data-branch-field="status"]');
      const progressLabel = card?.querySelector(`[data-progress-label="${branchId}"]`);
      if (progressInput) progressInput.value = item.progress;
      if (statusInput) statusInput.value = item.status;
      if (progressLabel) progressLabel.textContent = `${item.progress}%`;
      const badge = card?.querySelector('.branch-status-dot');
      const palette = STATUS_COLORS[item.status];
      if (badge && palette) {
        badge.textContent = item.status;
        badge.style.setProperty('--status-color', palette.color);
        badge.style.setProperty('--status-soft', palette.soft);
      }
    }
  };
  $('branchExecutionList').addEventListener('input', updateBranchField);
  $('branchExecutionList').addEventListener('change', updateBranchField);

  $('activityForm').addEventListener('submit', event => {
    event.preventDefault();
    if (!editingSelectedBranches.size) {
      showToast('Selecione pelo menos uma filial.', 'error');
      return;
    }
    const id = $('activityId').value || uid();
    const previous = state.activities.find(item => item.id === id);
    const branchItems = state.branches
      .filter(branch => editingSelectedBranches.has(branch.id))
      .map(branch => ({ ...defaultBranchItem(branch.id, $('activityDueDate').value), ...(editingBranchItems.get(branch.id) || {}), branchId: branch.id, updatedAt: editingBranchItems.get(branch.id)?.updatedAt || nowIso() }));
    const control = {
      id,
      title: $('activityTitle').value.trim(),
      routine: $('activityRoutine').value,
      cycle: $('activityCycle').value.trim(),
      priority: $('activityPriority').value,
      dueDate: $('activityDueDate').value,
      description: $('activityDescription').value.trim(),
      branchItems,
      createdAt: previous?.createdAt || nowIso(),
      updatedAt: nowIso()
    };
    const index = state.activities.findIndex(item => item.id === id);
    if (index >= 0) state.activities[index] = control; else state.activities.unshift(control);
    closeModal('activityModal');
    saveState(index >= 0 ? 'Checklist atualizado' : 'Checklist cadastrado');
  });

  $('deleteActivityButton').addEventListener('click', () => {
    const id = $('activityId').value;
    if (!id || !confirm('Excluir este checklist e o andamento de todas as filiais?')) return;
    state.activities = state.activities.filter(item => item.id !== id);
    closeModal('activityModal');
    saveState('Checklist excluído');
  });

  $('branchForm').addEventListener('submit', event => {
    event.preventDefault();
    const id = $('branchId').value || uid();
    const branch = { id, name: $('branchName').value.trim(), code: $('branchCode').value.trim(), region: $('branchRegion').value.trim() };
    const index = state.branches.findIndex(item => item.id === id);
    if (index >= 0) state.branches[index] = branch; else state.branches.push(branch);
    closeModal('branchModal');
    saveState(index >= 0 ? 'Filial atualizada' : 'Filial cadastrada');
  });
  $('deleteBranchButton').addEventListener('click', () => {
    const id = $('branchId').value;
    if (state.activities.some(control => (control.branchItems || []).some(item => item.branchId === id))) {
      showToast('Esta filial está incluída em um checklist e não pode ser excluída.', 'error');
      return;
    }
    if (!id || !confirm('Excluir esta filial?')) return;
    state.branches = state.branches.filter(item => item.id !== id);
    closeModal('branchModal');
    saveState('Filial excluída');
  });

  $('personForm').addEventListener('submit', event => {
    event.preventDefault();
    const id = $('personId').value || uid();
    const person = { id, name: $('personName').value.trim(), role: $('personRole').value.trim(), contact: $('personContact').value.trim() };
    const index = state.people.findIndex(item => item.id === id);
    if (index >= 0) state.people[index] = person; else state.people.push(person);
    closeModal('personModal');
    saveState(index >= 0 ? 'Responsável atualizado' : 'Responsável cadastrado');
  });
  $('deletePersonButton').addEventListener('click', () => {
    const id = $('personId').value;
    if (!id || !confirm('Excluir este responsável? As filiais ficarão sem responsável.')) return;
    state.people = state.people.filter(item => item.id !== id);
    state.activities = state.activities.map(control => ({
      ...control,
      branchItems: (control.branchItems || []).map(item => item.responsibleId === id ? { ...item, responsibleId: '', updatedAt: nowIso() } : item),
      updatedAt: nowIso()
    }));
    closeModal('personModal');
    saveState('Responsável excluído');
  });

  ['dashboardRoutineFilter', 'dashboardBranchFilter', 'dashboardCycleFilter'].forEach(id => $(id).addEventListener('change', renderDashboard));
  $('clearDashboardFilters').addEventListener('click', () => {
    $('dashboardRoutineFilter').value = '';
    $('dashboardBranchFilter').value = '';
    $('dashboardCycleFilter').value = '';
    renderDashboard();
  });
  ['activitySearch', 'activityRoutineFilter', 'activityStatusFilter', 'activityBranchFilter', 'activityCycleFilter'].forEach(id => $(id).addEventListener(id === 'activitySearch' ? 'input' : 'change', renderActivities));
  $('clearActivityFilters').addEventListener('click', () => {
    $('activitySearch').value = '';
    $('activityRoutineFilter').value = '';
    $('activityStatusFilter').value = '';
    $('activityBranchFilter').value = '';
    $('activityCycleFilter').value = '';
    renderActivities();
  });
  document.querySelectorAll('[data-layout]').forEach(button => button.addEventListener('click', () => {
    activityLayout = button.dataset.layout;
    document.querySelectorAll('[data-layout]').forEach(item => item.classList.toggle('active', item === button));
    renderActivities();
  }));

  document.addEventListener('click', event => {
    const editActivity = event.target.closest('[data-edit-activity]');
    if (editActivity) openActivityForm(editActivity.dataset.editActivity);
    const editBranch = event.target.closest('[data-edit-branch]');
    if (editBranch) openBranchForm(editBranch.dataset.editBranch);
    const editPerson = event.target.closest('[data-edit-person]');
    if (editPerson) openPersonForm(editPerson.dataset.editPerson);
    const goView = event.target.closest('[data-go-view]');
    if (goView) {
      navigate(goView.dataset.goView);
      if (goView.dataset.statusFilter) $('activityStatusFilter').value = goView.dataset.statusFilter;
      renderActivities();
    }
  });

  $('exportBackupButton').addEventListener('click', exportBackup);
  $('exportCsvButton').addEventListener('click', exportCsv);
  $('importBackupInput').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = migrateState(JSON.parse(await file.text()));
      if (!confirm('Restaurar este backup? Os dados atuais serão substituídos.')) return;
      state = imported;
      saveState('Backup restaurado');
    } catch (error) {
      showToast('Não foi possível importar este arquivo.', 'error');
    } finally {
      event.target.value = '';
    }
  });
  $('resetDataButton').addEventListener('click', () => {
    if (!confirm('Apagar todos os checklists deste navegador e reiniciar?')) return;
    state = createInitialState();
    saveState('Dados reiniciados');
  });

  window.addEventListener('storage', event => {
    if (event.key === STORAGE_KEY && event.newValue) {
      try { state = migrateState(JSON.parse(event.newValue)); renderAll(); showToast('Dados atualizados em outra aba'); } catch (_) { /* ignora */ }
    }
  });
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(error => console.warn('Service worker não registrado:', error)));
  }
}

function init() {
  bindEvents();
  renderAll();
  navigate(currentView);
  registerServiceWorker();
}

document.addEventListener('DOMContentLoaded', init);
