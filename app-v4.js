'use strict';

/*
 * Fluxo independente:
 * 1. O checklist é cadastrado sem depender de filial.
 * 2. O modelo Gemba e o responsável podem ser vinculados no cadastro.
 * 3. A associação e o andamento das filiais ficam disponíveis depois que o checklist existe.
 */

(function applyIndependentChecklistFlow() {
  const extraStyles = document.createElement('link');
  extraStyles.rel = 'stylesheet';
  extraStyles.href = './app-v4.css?v=6';
  document.head.appendChild(extraStyles);

  const nav = document.querySelector('.nav');
  if (nav && !nav.querySelector('[data-gemba-link]')) {
    const gembaLink = document.createElement('a');
    gembaLink.className = 'nav-item';
    gembaLink.dataset.gembaLink = '';
    gembaLink.href = './gemba.html';
    gembaLink.style.textDecoration = 'none';
    gembaLink.innerHTML = '<span class="nav-icon">03</span>Construtor Gemba';
    nav.insertBefore(gembaLink, nav.children[2] || null);
    [...nav.querySelectorAll('.nav-item')].forEach((item, index) => {
      const icon = item.querySelector('.nav-icon');
      if (icon) icon.textContent = String(index + 1).padStart(2, '0');
    });
  }

  function setAssociationVisibility(enabled) {
    const associationSection = $('associationSection') || $('branchSelection')?.closest('.form-section');
    const executionSection = $('executionSection');
    const lockedNotice = $('associationLockedNotice');
    const subtitle = document.querySelector('#activityModal .modal-subtitle');
    const saveButton = $('saveChecklistButton') || document.querySelector('#activityForm button[type="submit"]');

    associationSection?.classList.toggle('hidden', !enabled);
    executionSection?.classList.toggle('hidden', !enabled);
    lockedNotice?.classList.toggle('hidden', enabled);

    if (subtitle) {
      subtitle.textContent = enabled
        ? 'Atualize o vínculo Gemba, o responsável, as filiais e os andamentos.'
        : 'Cadastre o controle, associe uma inspeção Gemba e escolha quem receberá o link.';
    }
    if (saveButton) saveButton.textContent = enabled ? 'Salvar alterações' : 'Cadastrar checklist';
  }

  openActivityForm = function openIndependentChecklistForm(activityId = '') {
    $('activityForm').reset();
    $('activityId').value = '';
    $('activityModalTitle').textContent = 'Novo checklist';
    $('deleteActivityButton').hidden = true;
    $('activityPriority').value = 'Média';
    if ($('activityGembaTemplate')) $('activityGembaTemplate').value = '';
    if ($('activityGembaInspector')) $('activityGembaInspector').value = '';
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
      if ($('activityGembaTemplate')) $('activityGembaTemplate').value = control.gemba?.templateSlug || '';
      if ($('activityGembaInspector')) $('activityGembaInspector').value = control.gemba?.inspectorId || '';

      (control.branchItems || []).forEach(item => {
        editingSelectedBranches.add(item.branchId);
        editingBranchItems.set(item.branchId, {
          ...defaultBranchItem(item.branchId, control.dueDate || ''),
          ...item
        });
      });

      $('activityModalTitle').textContent = 'Gerenciar checklist';
      $('deleteActivityButton').hidden = false;
      setAssociationVisibility(true);
    } else {
      setAssociationVisibility(false);
    }

    renderBranchSelection();
    renderBranchExecutionList();
    openModal('activityModal');
  };

  const originalActivityCard = activityCard;
  activityCard = function independentChecklistCard(control) {
    const html = originalActivityCard(control);
    const totalBranches = (control.branchItems || []).length;
    if (totalBranches) return html;

    return html
      .replace('<div class="branch-chips"></div>', '<div class="association-pending"><strong>Checklist cadastrado</strong><span>Nenhuma filial associada. Abra o checklist para fazer a associação.</span></div>')
      .replace('>Abrir checklist</button>', '>Associar filiais</button>');
  };

  const form = $('activityForm');
  form.addEventListener('submit', event => {
    event.preventDefault();
    event.stopImmediatePropagation();

    const id = $('activityId').value || uid();
    const previous = state.activities.find(item => item.id === id);
    const isNew = !previous;
    const gembaTemplateSelect = $('activityGembaTemplate');
    const gembaInspectorSelect = $('activityGembaInspector');
    const templateSlug = gembaTemplateSelect?.value || '';
    const inspectorId = gembaInspectorSelect?.value || '';

    if (templateSlug && !inspectorId) {
      showToast('Selecione a pessoa responsável pela inspeção Gemba.', 'error');
      return;
    }

    let branchItems = [];
    if (!isNew) {
      branchItems = state.branches
        .filter(branch => editingSelectedBranches.has(branch.id))
        .map(branch => ({
          ...defaultBranchItem(branch.id, $('activityDueDate').value),
          ...(editingBranchItems.get(branch.id) || {}),
          branchId: branch.id,
          updatedAt: editingBranchItems.get(branch.id)?.updatedAt || nowIso()
        }));
    }

    const selectedTemplateOption = gembaTemplateSelect?.selectedOptions?.[0];
    const gemba = templateSlug ? {
      templateSlug,
      templateTitle: selectedTemplateOption?.dataset?.title || selectedTemplateOption?.textContent?.trim() || previous?.gemba?.templateTitle || '',
      inspectorId,
      assignedAt: previous?.gemba?.inspectorId === inspectorId ? previous.gemba.assignedAt : nowIso(),
      updatedAt: nowIso()
    } : null;

    const control = {
      id,
      title: $('activityTitle').value.trim(),
      routine: $('activityRoutine').value,
      cycle: $('activityCycle').value.trim(),
      priority: $('activityPriority').value,
      dueDate: $('activityDueDate').value,
      description: $('activityDescription').value.trim(),
      gemba,
      branchItems,
      createdAt: previous?.createdAt || nowIso(),
      updatedAt: nowIso()
    };

    const index = state.activities.findIndex(item => item.id === id);
    if (index >= 0) state.activities[index] = control;
    else state.activities.unshift(control);

    closeModal('activityModal');
    saveState(isNew
      ? (gemba ? 'Checklist cadastrado e link Gemba criado.' : 'Checklist cadastrado. Abra-o para associar as filiais.')
      : 'Checklist, vínculo Gemba e associações atualizados.');
  }, true);
})();
