'use strict';

const STORAGE_KEY = 'sep-certificacao-controle-v1';
const ROUTINES = [
  'Separação de Marcas',
  'Checklist Gemba',
  'Certificação / Auditoria',
  'Plano de Ação',
  'Outra rotina'
];
const STATUSES = [
  'Não iniciado',
  'Em andamento',
  'Aguardando retorno',
  'Bloqueado',
  'Concluído'
];
const STATUS_COLORS = {
  'Não iniciado': { color: '#7c899d', soft: '#edf1f6' },
  'Em andamento': { color: '#2e65f3', soft: '#e9efff' },
  'Aguardando retorno': { color: '#c98305', soft: '#fff4d8' },
  'Bloqueado': { color: '#d84a4a', soft: '#ffebeb' },
  'Concluído': { color: '#22a06b', soft: '#e5f6ee' }
};
const VIEW_META = {
  dashboard: ['Visão geral', 'Dashboard de andamento'],
  activities: ['Controle operacional', 'Rotinas e checklists'],
  branches: ['Estrutura', 'Filiais'],
  people: ['Contatos', 'Responsáveis'],
  data: ['Segurança dos dados', 'Dados e backup']
};

const nowIso = () => new Date().toISOString();
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

function createInitialState() {
  return {
    version: 1,
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

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.activities) || !Array.isArray(parsed.branches) || !Array.isArray(parsed.people)) {
      throw new Error('Estrutura inválida');
    }
    return parsed;
  } catch (error) {
    console.warn('Falha ao carregar dados locais:', error);
    return createInitialState();
  }
}

let state = loadState();
let currentView = 'dashboard';
let activityLayout = 'cards';

function saveState(message = 'Alterações salvas') {
  state.meta = state.meta || {};
  state.meta.updatedAt = nowIso();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderAll();
  if (message) showToast(message);
}

function $(id) { return document.getElementById(id); }
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
function formatDate(value) {
  if (!value) return 'Sem prazo';
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}
function formatDateTime(value) {
  if (!value) return 'Ainda não atualizado';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}
function isOverdue(activity) {
  if (!activity.dueDate || activity.status === 'Concluído') return false;
  const end = new Date(`${activity.dueDate}T23:59:59`);
  return end.getTime() < Date.now();
}
function statusBadge(status) {
  const palette = STATUS_COLORS[status] || STATUS_COLORS['Não iniciado'];
  return `<span class="status-badge" style="--badge-bg:${palette.soft};--badge-color:${palette.color}">${escapeHTML(status)}</span>`;
}
function priorityWeight(priority) {
  return ({ Crítica: 4, Alta: 3, Média: 2, Baixa: 1 })[priority] || 0;
}

function showToast(message, type = '') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`.trim();
  toast.textContent = message;
  $('toastContainer').appendChild(toast);
  window.setTimeout(() => toast.remove(), 2800);
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
  const peopleEntries = state.people.map(item => ({ value: item.id, label: item.name }));
  const cycles = getCycles();

  setOptions($('dashboardRoutineFilter'), ROUTINES, 'Todas as rotinas');
  setOptions($('dashboardBranchFilter'), branchEntries, 'Todas as filiais');
  setOptions($('dashboardCycleFilter'), cycles, 'Todos os ciclos');

  setOptions($('activityRoutineFilter'), ROUTINES, 'Todas as rotinas');
  setOptions($('activityStatusFilter'), STATUSES, 'Todos os status');
  setOptions($('activityBranchFilter'), branchEntries, 'Todas as filiais');
  setOptions($('activityCycleFilter'), cycles, 'Todos os ciclos');

  setOptions($('activityRoutine'), ROUTINES, null);
  setOptions($('activityBranch'), branchEntries, null);
  setOptions($('activityResponsible'), peopleEntries, 'Não definido');
  setOptions($('activityStatus'), STATUSES, null);
}

function dashboardActivities() {
  const routine = $('dashboardRoutineFilter').value;
  const branch = $('dashboardBranchFilter').value;
  const cycle = $('dashboardCycleFilter').value;
  return state.activities.filter(item =>
    (!routine || item.routine === routine) &&
    (!branch || item.branchId === branch) &&
    (!cycle || item.cycle === cycle)
  );
}

function renderDashboard() {
  const activities = dashboardActivities();
  const counts = Object.fromEntries(STATUSES.map(status => [status, activities.filter(item => item.status === status).length]));
  const overdue = activities.filter(isOverdue).length;
  const progress = average(activities.map(item => item.progress));
  const kpis = [
    { label: 'Total de controles', value: activities.length, detail: 'no recorte atual', accent: '#2e65f3', soft: '#e9efff' },
    { label: 'Concluídos', value: counts['Concluído'], detail: 'finalizados', accent: '#22a06b', soft: '#e5f6ee' },
    { label: 'Em andamento', value: counts['Em andamento'], detail: 'em execução', accent: '#4778f6', soft: '#edf2ff' },
    { label: 'Aguardando retorno', value: counts['Aguardando retorno'], detail: 'dependem de resposta', accent: '#c98305', soft: '#fff4d8' },
    { label: 'Bloqueados / atrasados', value: counts['Bloqueado'] + overdue, detail: `${overdue} com prazo vencido`, accent: '#d84a4a', soft: '#ffebeb' },
    { label: 'Progresso médio', value: `${progress}%`, detail: 'média dos controles', accent: '#7a5cf0', soft: '#f0ecff' }
  ];
  $('kpiGrid').innerHTML = kpis.map(item => `
    <article class="kpi-card" style="--accent:${item.accent};--accent-soft:${item.soft}">
      <span class="kpi-accent"></span>
      <span class="kpi-label">${item.label}</span>
      <strong>${item.value}</strong>
      <small>${item.detail}</small>
    </article>`).join('');

  $('routineProgressChart').innerHTML = ROUTINES.map(routine => {
    const items = activities.filter(item => item.routine === routine);
    const value = average(items.map(item => item.progress));
    return `<div class="bar-row">
      <span class="bar-label" title="${escapeHTML(routine)}">${escapeHTML(routine)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${value}%"></div></div>
      <span class="bar-value">${value}%</span>
    </div>`;
  }).join('');

  const total = activities.length;
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
  $('statusLegend').innerHTML = STATUSES.map(status => `
    <div class="legend-item">
      <span class="legend-dot" style="--legend-color:${STATUS_COLORS[status].color}"></span>
      <span>${escapeHTML(status)}</span>
      <strong>${counts[status]}</strong>
    </div>`).join('');

  const pending = activities
    .filter(item => item.status === 'Aguardando retorno' || item.pendingFrom)
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
    .slice(0, 6);
  $('pendingReturns').innerHTML = pending.length ? pending.map(item => `
    <button class="stack-item" data-edit-activity="${item.id}">
      <div>
        <strong>${escapeHTML(item.pendingFrom || item.title)}</strong>
        <p>${escapeHTML(item.title)} · ${escapeHTML(branchName(item.branchId))}</p>
      </div>
      <div class="item-meta"><strong>${item.progress || 0}%</strong><p>${escapeHTML(item.cycle || 'Sem ciclo')}</p></div>
    </button>`).join('') : emptyState('Nenhum retorno pendente', 'Os itens aguardando resposta aparecerão aqui.');

  const attention = activities
    .filter(item => item.status === 'Bloqueado' || isOverdue(item) || ['Alta', 'Crítica'].includes(item.priority))
    .sort((a, b) => Number(isOverdue(b)) - Number(isOverdue(a)) || priorityWeight(b.priority) - priorityWeight(a.priority))
    .slice(0, 6);
  $('attentionList').innerHTML = attention.length ? attention.map(item => `
    <button class="stack-item" data-edit-activity="${item.id}">
      <div>
        <strong>${escapeHTML(item.title)}</strong>
        <p>${escapeHTML(item.blocker || (isOverdue(item) ? 'Prazo vencido' : `Prioridade ${item.priority || 'Média'}`))}</p>
      </div>
      <div class="item-meta"><strong>${escapeHTML(branchName(item.branchId))}</strong><p>${formatDate(item.dueDate)}</p></div>
    </button>`).join('') : emptyState('Nenhum ponto crítico', 'Bloqueios, atrasos e prioridades altas aparecerão aqui.');

  const branchRows = state.branches.map(branch => {
    const items = activities.filter(item => item.branchId === branch.id);
    const concluded = items.filter(item => item.status === 'Concluído').length;
    const pendingCount = items.filter(item => item.status !== 'Concluído').length;
    const branchProgress = average(items.map(item => item.progress));
    return { branch, items, concluded, pendingCount, branchProgress };
  }).filter(row => row.items.length || !$('dashboardBranchFilter').value)
    .sort((a, b) => b.branchProgress - a.branchProgress || a.branch.name.localeCompare(b.branch.name, 'pt-BR'));
  $('branchSummaryBody').innerHTML = branchRows.length ? branchRows.map(row => `
    <tr>
      <td><strong>${escapeHTML(row.branch.name)}</strong><br><small>${escapeHTML(row.branch.code || '')}</small></td>
      <td>${row.items.length}</td>
      <td>${row.concluded}</td>
      <td>${row.pendingCount}</td>
      <td><div class="table-progress"><div class="bar-track"><div class="bar-fill" style="width:${row.branchProgress}%"></div></div><strong>${row.branchProgress}%</strong></div></td>
    </tr>`).join('') : `<tr><td colspan="5">Nenhuma filial encontrada para este filtro.</td></tr>`;

  $('lastUpdate').textContent = `Atualizado em ${formatDateTime(state.meta?.updatedAt)}`;
}

function filteredActivities() {
  const query = normalize($('activitySearch').value);
  const routine = $('activityRoutineFilter').value;
  const status = $('activityStatusFilter').value;
  const branch = $('activityBranchFilter').value;
  const cycle = $('activityCycleFilter').value;
  return state.activities.filter(item => {
    const haystack = normalize([
      item.title, item.routine, branchName(item.branchId), personName(item.responsibleId),
      item.pendingFrom, item.blocker, item.evidence, item.notes, item.cycle
    ].join(' '));
    return (!query || haystack.includes(query)) &&
      (!routine || item.routine === routine) &&
      (!status || item.status === status) &&
      (!branch || item.branchId === branch) &&
      (!cycle || item.cycle === cycle);
  }).sort((a, b) => {
    const statusRank = status => ({ Bloqueado: 0, 'Aguardando retorno': 1, 'Em andamento': 2, 'Não iniciado': 3, Concluído: 4 })[status] ?? 5;
    return statusRank(a.status) - statusRank(b.status) || priorityWeight(b.priority) - priorityWeight(a.priority) || new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
  });
}

function activityCard(item) {
  const note = item.blocker || item.pendingFrom || item.notes;
  return `<article class="activity-card">
    <div class="activity-card-header">
      <span class="routine-label">${escapeHTML(item.routine)}</span>
      ${statusBadge(item.status)}
    </div>
    <h3>${escapeHTML(item.title)}</h3>
    <p class="activity-subtitle">${escapeHTML(branchName(item.branchId))} · ${escapeHTML(item.cycle || 'Sem ciclo')}</p>
    <div class="activity-progress">
      <div class="activity-progress-head"><span>Andamento</span><strong>${Number(item.progress || 0)}%</strong></div>
      <div class="bar-track"><div class="bar-fill" style="width:${Number(item.progress || 0)}%"></div></div>
    </div>
    <div class="activity-info">
      <div class="info-cell"><span>Responsável</span><strong>${escapeHTML(personName(item.responsibleId))}</strong></div>
      <div class="info-cell"><span>Prazo</span><strong>${escapeHTML(formatDate(item.dueDate))}${isOverdue(item) ? ' · vencido' : ''}</strong></div>
      <div class="info-cell"><span>Prioridade</span><strong>${escapeHTML(item.priority || 'Média')}</strong></div>
      <div class="info-cell"><span>Pendente de</span><strong>${escapeHTML(item.pendingFrom || 'Ninguém')}</strong></div>
    </div>
    ${note ? `<div class="activity-note">${escapeHTML(note)}</div>` : ''}
    <div class="card-actions">
      <span class="updated-at">Atualizado ${formatDateTime(item.updatedAt)}</span>
      <button class="edit-button" data-edit-activity="${item.id}">Abrir controle</button>
    </div>
  </article>`;
}

function renderActivities() {
  const items = filteredActivities();
  $('activityCount').textContent = `${items.length} ${items.length === 1 ? 'controle' : 'controles'}`;
  $('activityCards').innerHTML = items.length ? items.map(activityCard).join('') : emptyState('Nenhum controle encontrado', 'Cadastre um novo controle ou ajuste os filtros.');
  $('activityTableBody').innerHTML = items.length ? items.map(item => `
    <tr>
      <td><strong>${escapeHTML(item.title)}</strong><br><small>${escapeHTML(item.cycle || 'Sem ciclo')}</small></td>
      <td>${escapeHTML(item.routine)}</td>
      <td>${escapeHTML(branchName(item.branchId))}</td>
      <td>${escapeHTML(personName(item.responsibleId))}</td>
      <td>${statusBadge(item.status)}</td>
      <td><div class="table-progress"><div class="bar-track"><div class="bar-fill" style="width:${Number(item.progress || 0)}%"></div></div><strong>${Number(item.progress || 0)}%</strong></div></td>
      <td>${escapeHTML(formatDate(item.dueDate))}${isOverdue(item) ? '<br><small>Vencido</small>' : ''}</td>
      <td><button class="edit-button" data-edit-activity="${item.id}">Editar</button></td>
    </tr>`).join('') : `<tr><td colspan="8">Nenhum controle encontrado.</td></tr>`;

  $('activityCards').classList.toggle('hidden', activityLayout !== 'cards');
  $('activityTableContainer').classList.toggle('hidden', activityLayout !== 'table');
}

function renderBranches() {
  $('branchCards').innerHTML = state.branches.length ? state.branches.map(branch => {
    const items = state.activities.filter(item => item.branchId === branch.id);
    const progress = average(items.map(item => item.progress));
    const initials = branch.name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
    return `<article class="management-card">
      <div class="management-avatar">${escapeHTML(initials || 'F')}</div>
      <div>
        <h3>${escapeHTML(branch.name)}</h3>
        <p>${escapeHTML([branch.code, branch.region].filter(Boolean).join(' · ') || 'Sem código ou região')}</p>
        <div class="management-stats"><span>${items.length} controles</span><span>${progress}% concluído</span></div>
      </div>
      <button class="icon-button" data-edit-branch="${branch.id}" aria-label="Editar filial">⋯</button>
    </article>`;
  }).join('') : emptyState('Nenhuma filial cadastrada', 'Cadastre as unidades que participam das rotinas.');
}

function renderPeople() {
  $('peopleCards').innerHTML = state.people.length ? state.people.map(person => {
    const assigned = state.activities.filter(item => item.responsibleId === person.id);
    const open = assigned.filter(item => item.status !== 'Concluído').length;
    const initials = person.name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
    return `<article class="management-card">
      <div class="management-avatar">${escapeHTML(initials || 'R')}</div>
      <div>
        <h3>${escapeHTML(person.name)}</h3>
        <p>${escapeHTML([person.role, person.contact].filter(Boolean).join(' · ') || 'Sem função ou contato')}</p>
        <div class="management-stats"><span>${assigned.length} atribuídos</span><span>${open} pendentes</span></div>
      </div>
      <button class="icon-button" data-edit-person="${person.id}" aria-label="Editar responsável">⋯</button>
    </article>`;
  }).join('') : emptyState('Nenhum responsável cadastrado', 'Cadastre as pessoas que participam das rotinas.');
}

function emptyState(title, text) {
  return `<div class="empty-state"><strong>${escapeHTML(title)}</strong><span>${escapeHTML(text)}</span></div>`;
}

function renderAll() {
  hydrateOptions();
  renderDashboard();
  renderActivities();
  renderBranches();
  renderPeople();
}

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
function closeModal(id) {
  $(id).hidden = true;
  document.body.style.overflow = '';
}

function openActivityForm(activityId = '') {
  $('activityForm').reset();
  $('activityId').value = '';
  $('activityModalTitle').textContent = 'Novo controle';
  $('deleteActivityButton').hidden = true;
  $('activityProgress').value = 0;
  $('progressValue').textContent = '0%';
  $('activityStatus').value = 'Não iniciado';
  $('activityPriority').value = 'Média';

  if (activityId) {
    const item = state.activities.find(activity => activity.id === activityId);
    if (!item) return;
    $('activityId').value = item.id;
    $('activityTitle').value = item.title || '';
    $('activityRoutine').value = item.routine || ROUTINES[0];
    $('activityBranch').value = item.branchId || '';
    $('activityCycle').value = item.cycle || '';
    $('activityResponsible').value = item.responsibleId || '';
    $('activityStatus').value = item.status || 'Não iniciado';
    $('activityPriority').value = item.priority || 'Média';
    $('activityProgress').value = Number(item.progress || 0);
    $('progressValue').textContent = `${Number(item.progress || 0)}%`;
    $('activityDueDate').value = item.dueDate || '';
    $('activityPendingFrom').value = item.pendingFrom || '';
    $('activityBlocker').value = item.blocker || '';
    $('activityEvidence').value = item.evidence || '';
    $('activityNotes').value = item.notes || '';
    $('activityModalTitle').textContent = 'Editar controle';
    $('deleteActivityButton').hidden = false;
  }
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
  const columns = [
    ['Título', item => item.title],
    ['Rotina', item => item.routine],
    ['Filial', item => branchName(item.branchId)],
    ['Ciclo', item => item.cycle],
    ['Responsável', item => personName(item.responsibleId)],
    ['Status', item => item.status],
    ['Progresso', item => `${item.progress || 0}%`],
    ['Prioridade', item => item.priority],
    ['Prazo', item => formatDate(item.dueDate)],
    ['Pendente de retorno de', item => item.pendingFrom],
    ['Bloqueio', item => item.blocker],
    ['Evidências', item => item.evidence],
    ['Próxima ação / observações', item => item.notes],
    ['Atualizado em', item => formatDateTime(item.updatedAt)]
  ];
  const csvEscape = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const rows = [columns.map(column => csvEscape(column[0])).join(';')];
  state.activities.forEach(item => rows.push(columns.map(column => csvEscape(column[1](item))).join(';')));
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
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => backdrop.addEventListener('click', event => {
    if (event.target === backdrop) closeModal(backdrop.id);
  }));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') document.querySelectorAll('.modal-backdrop:not([hidden])').forEach(modal => closeModal(modal.id));
  });

  $('activityProgress').addEventListener('input', event => {
    $('progressValue').textContent = `${event.target.value}%`;
    if (Number(event.target.value) === 100) $('activityStatus').value = 'Concluído';
    if (Number(event.target.value) < 100 && $('activityStatus').value === 'Concluído') $('activityStatus').value = 'Em andamento';
  });
  $('activityStatus').addEventListener('change', event => {
    if (event.target.value === 'Concluído') {
      $('activityProgress').value = 100;
      $('progressValue').textContent = '100%';
    }
  });

  $('activityForm').addEventListener('submit', event => {
    event.preventDefault();
    const id = $('activityId').value || uid();
    const previous = state.activities.find(item => item.id === id);
    const activity = {
      id,
      title: $('activityTitle').value.trim(),
      routine: $('activityRoutine').value,
      branchId: $('activityBranch').value,
      cycle: $('activityCycle').value.trim(),
      responsibleId: $('activityResponsible').value,
      status: $('activityStatus').value,
      priority: $('activityPriority').value,
      progress: Number($('activityProgress').value),
      dueDate: $('activityDueDate').value,
      pendingFrom: $('activityPendingFrom').value.trim(),
      blocker: $('activityBlocker').value.trim(),
      evidence: $('activityEvidence').value.trim(),
      notes: $('activityNotes').value.trim(),
      createdAt: previous?.createdAt || nowIso(),
      updatedAt: nowIso()
    };
    const index = state.activities.findIndex(item => item.id === id);
    if (index >= 0) state.activities[index] = activity; else state.activities.unshift(activity);
    closeModal('activityModal');
    saveState(index >= 0 ? 'Controle atualizado' : 'Controle cadastrado');
  });

  $('deleteActivityButton').addEventListener('click', () => {
    const id = $('activityId').value;
    if (!id || !confirm('Excluir este controle? Esta ação não pode ser desfeita.')) return;
    state.activities = state.activities.filter(item => item.id !== id);
    closeModal('activityModal');
    saveState('Controle excluído');
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
    if (state.activities.some(item => item.branchId === id)) {
      showToast('Esta filial possui controles vinculados e não pode ser excluída.', 'error');
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
    if (!id || !confirm('Excluir este responsável? Os controles ficarão sem responsável.')) return;
    state.people = state.people.filter(item => item.id !== id);
    state.activities = state.activities.map(item => item.responsibleId === id ? { ...item, responsibleId: '', updatedAt: nowIso() } : item);
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
  ['activitySearch', 'activityRoutineFilter', 'activityStatusFilter', 'activityBranchFilter', 'activityCycleFilter'].forEach(id => {
    $(id).addEventListener(id === 'activitySearch' ? 'input' : 'change', renderActivities);
  });
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
      const imported = JSON.parse(await file.text());
      if (!Array.isArray(imported.activities) || !Array.isArray(imported.branches) || !Array.isArray(imported.people)) throw new Error('Arquivo inválido');
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
    if (!confirm('Apagar todos os controles deste navegador e reiniciar?')) return;
    state = createInitialState();
    saveState('Dados reiniciados');
  });

  window.addEventListener('storage', event => {
    if (event.key === STORAGE_KEY && event.newValue) {
      try { state = JSON.parse(event.newValue); renderAll(); showToast('Dados atualizados em outra aba'); } catch (_) { /* ignora */ }
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
