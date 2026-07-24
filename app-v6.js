'use strict';

(function connectChecklistToGemba() {
  const GEMBA_API = 'https://sep-gemba.vercel.app/api/blob';
  const GEMBA_INSPECT_URL = 'https://aruanmf446-hub.github.io/SEP/gemba-blob.html';
  let gembaModels = [];
  let gembaModelsError = '';
  let gembaModelsPromise = null;

  const baseActivityCard = activityCard;
  const baseOpenActivityForm = openActivityForm;
  const baseSaveState = saveState;

  function personById(id) { return state.people.find(person => person.id === id) || null; }
  function controlById(id) { return state.activities.find(control => control.id === id) || null; }

  function gembaApiUrl(action, query = {}) {
    const url = new URL(GEMBA_API);
    url.searchParams.set('action', action);
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    });
    return url;
  }

  async function gembaApi(action, query = {}) {
    const response = await fetch(gembaApiUrl(action, query), { cache: 'no-store' });
    let payload = null;
    try { payload = await response.json(); } catch (_) { payload = null; }
    if (!response.ok) throw new Error(payload?.error || `Não foi possível acessar os modelos Gemba (${response.status}).`);
    return payload;
  }

  async function loadGembaModels() {
    try {
      const listing = await gembaApi('list', { prefix: 'sep/dados/checklists/' });
      const modelPaths = [...new Set((listing.blobs || [])
        .map(blob => blob.pathname)
        .filter(path => /^sep\/dados\/checklists\/[^/]+\/modelo\.json$/.test(path)))];

      const rows = await Promise.all(modelPaths.map(async path => {
        const file = await gembaApi('get', { path });
        const model = JSON.parse(file.text);
        const slug = path.split('/')[3];
        return { ...model, slug };
      }));

      gembaModels = rows.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'pt-BR'));
      gembaModelsError = '';
      return gembaModels;
    } catch (error) {
      gembaModels = [];
      gembaModelsError = error.message;
      throw error;
    }
  }

  function ensureModelsLoaded() {
    if (!gembaModelsPromise) gembaModelsPromise = loadGembaModels();
    return gembaModelsPromise;
  }

  function populateGembaPeople(selectedId = '') {
    const select = $('activityGembaInspector');
    if (!select) return;
    const current = selectedId || select.value;
    select.innerHTML = `<option value="">Selecione uma pessoa</option>${state.people.map(person => `<option value="${escapeHTML(person.id)}">${escapeHTML(person.name)}${person.role ? ` · ${escapeHTML(person.role)}` : ''}</option>`).join('')}`;
    if ([...select.options].some(option => option.value === current)) select.value = current;
  }

  function populateGembaTemplates(selectedSlug = '') {
    const select = $('activityGembaTemplate');
    if (!select) return;
    const current = selectedSlug || select.value;
    const options = ['<option value="">Não associar a um modelo Gemba</option>'];
    gembaModels.forEach(model => options.push(`<option value="${escapeHTML(model.slug)}" data-title="${escapeHTML(model.title || model.slug)}">${escapeHTML(model.title || model.slug)}</option>`));
    if (current && !gembaModels.some(model => model.slug === current)) {
      const storedTitle = controlById($('activityId')?.value)?.gemba?.templateTitle || current;
      options.push(`<option value="${escapeHTML(current)}" data-title="${escapeHTML(storedTitle)}">${escapeHTML(storedTitle)}</option>`);
    }
    select.innerHTML = options.join('');
    if ([...select.options].some(option => option.value === current)) select.value = current;
  }

  function branchPrefill(control) {
    const branchItems = control?.branchItems || [];
    if (branchItems.length !== 1) return '';
    return branchName(branchItems[0].branchId);
  }

  function buildGembaLink(control) {
    const templateSlug = control?.gemba?.templateSlug || '';
    const inspector = personById(control?.gemba?.inspectorId || '');
    if (!templateSlug || !inspector) return '';

    const url = new URL(GEMBA_INSPECT_URL);
    url.searchParams.set('mode', 'inspect');
    url.searchParams.set('checklist', templateSlug);
    url.searchParams.set('responsavelId', inspector.id);
    url.searchParams.set('responsavel', inspector.name);
    if (inspector.role) url.searchParams.set('responsavelFuncao', inspector.role);
    if (inspector.contact) url.searchParams.set('responsavelContato', inspector.contact);
    if (control.id) url.searchParams.set('controle', control.id);
    if (control.title) url.searchParams.set('controleNome', control.title);
    const branch = branchPrefill(control);
    if (branch) url.searchParams.set('filial', branch);
    return url.toString();
  }

  function formControlSnapshot() {
    const templateSelect = $('activityGembaTemplate');
    const selectedOption = templateSelect?.selectedOptions?.[0];
    const id = $('activityId')?.value || '';
    const previous = controlById(id);
    return {
      id,
      title: $('activityTitle')?.value.trim() || previous?.title || '',
      branchItems: previous?.branchItems || [],
      gemba: {
        templateSlug: templateSelect?.value || '',
        templateTitle: selectedOption?.dataset?.title || selectedOption?.textContent?.trim() || '',
        inspectorId: $('activityGembaInspector')?.value || ''
      }
    };
  }

  function updateGembaLinkPreview() {
    const panel = $('gembaLinkPanel');
    const input = $('activityGembaLink');
    const status = $('gembaLinkStatus');
    const copyButton = $('copyActivityGembaLink');
    const openButton = $('openActivityGembaLink');
    if (!panel || !input || !status) return;

    const templateSlug = $('activityGembaTemplate')?.value || '';
    const inspectorId = $('activityGembaInspector')?.value || '';
    const link = buildGembaLink(formControlSnapshot());
    input.value = link;
    copyButton.disabled = !link;
    openButton.disabled = !link;
    panel.classList.toggle('ready', Boolean(link));

    if (gembaModelsError && !gembaModels.length) status.textContent = gembaModelsError;
    else if (!templateSlug) status.textContent = 'Selecione o modelo Gemba.';
    else if (!inspectorId) status.textContent = 'Selecione quem fará a inspeção.';
    else status.textContent = 'Link pronto para compartilhar.';
  }

  async function copyText(text, successMessage = 'Link copiado.') {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      showToast(successMessage);
    } catch (_) {
      prompt('Copie o link:', text);
    }
  }

  async function hydrateGembaForm(control = null) {
    const selectedInspector = control?.gemba?.inspectorId || '';
    const selectedTemplate = control?.gemba?.templateSlug || '';
    populateGembaPeople(selectedInspector);
    populateGembaTemplates(selectedTemplate);
    updateGembaLinkPreview();

    try {
      await ensureModelsLoaded();
      populateGembaTemplates(selectedTemplate || $('activityGembaTemplate')?.value || '');
    } catch (error) {
      showToast(error.message, 'error');
    }
    updateGembaLinkPreview();
  }

  saveState = function saveStateWithGemba(message = 'Alterações salvas') {
    state.activities = (state.activities || []).map(control => {
      if (!control.gemba) return control;
      if (!personById(control.gemba.inspectorId)) return { ...control, gemba: { ...control.gemba, inspectorId: '' } };
      return control;
    });
    baseSaveState(message);
    if ($('activityModal') && !$('activityModal').hidden) {
      populateGembaPeople($('activityGembaInspector')?.value || '');
      updateGembaLinkPreview();
    }
  };

  openActivityForm = function openActivityWithGemba(activityId = '') {
    baseOpenActivityForm(activityId);
    hydrateGembaForm(controlById(activityId));
  };

  activityCard = function activityCardWithGemba(control) {
    const html = baseActivityCard(control);
    if (!control.gemba?.templateSlug) return html;
    const inspector = personById(control.gemba.inspectorId);
    const link = buildGembaLink(control);
    const templateTitle = control.gemba.templateTitle || control.gemba.templateSlug;
    const block = `<div class="gemba-card-association"><div class="gemba-card-mark">G</div><div class="gemba-card-info"><span>Inspeção Gemba</span><strong>${escapeHTML(templateTitle)}</strong><small>${inspector ? `Responsável: ${escapeHTML(inspector.name)}` : 'Defina novamente o responsável'}</small></div><div class="gemba-card-buttons">${link ? `<button type="button" class="text-button" data-open-gemba-control="${escapeHTML(control.id)}">Abrir</button><button type="button" class="text-button" data-copy-gemba-control="${escapeHTML(control.id)}">Copiar link</button>` : `<button type="button" class="text-button" data-edit-activity="${escapeHTML(control.id)}">Definir responsável</button>`}</div></div>`;
    return html.replace('<div class="card-actions">', `${block}<div class="card-actions">`);
  };

  $('activityGembaTemplate')?.addEventListener('change', updateGembaLinkPreview);
  $('activityGembaInspector')?.addEventListener('change', updateGembaLinkPreview);
  $('activityTitle')?.addEventListener('input', updateGembaLinkPreview);
  $('copyActivityGembaLink')?.addEventListener('click', () => copyText($('activityGembaLink').value, 'Link da inspeção copiado.'));
  $('openActivityGembaLink')?.addEventListener('click', () => {
    const link = $('activityGembaLink').value;
    if (link) window.open(link, '_blank', 'noopener');
  });

  document.addEventListener('click', event => {
    const copy = event.target.closest('[data-copy-gemba-control]');
    if (copy) {
      event.preventDefault();
      event.stopPropagation();
      copyText(buildGembaLink(controlById(copy.dataset.copyGembaControl)), 'Link da inspeção copiado.');
      return;
    }
    const open = event.target.closest('[data-open-gemba-control]');
    if (open) {
      event.preventDefault();
      event.stopPropagation();
      const link = buildGembaLink(controlById(open.dataset.openGembaControl));
      if (link) window.open(link, '_blank', 'noopener');
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    populateGembaPeople();
    populateGembaTemplates();
    ensureModelsLoaded()
      .then(() => { populateGembaTemplates(); renderActivities(); })
      .catch(() => updateGembaLinkPreview());
  });
})();
