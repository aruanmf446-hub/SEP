'use strict';

/*
 * Correção de fluxo v4:
 * 1. O checklist é cadastrado sem depender de filial.
 * 2. A associação e o andamento das filiais só ficam disponíveis depois que o checklist existe.
 */

(function applyIndependentChecklistFlow() {
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
        ? 'O checklist já está cadastrado. Agora você pode associar as filiais e atualizar o andamento.'
        : 'Cadastre primeiro o checklist. A associação com as filiais será feita somente depois de salvar.';
    }
    if (saveButton) saveButton.textContent = enabled ? 'Salvar alterações' : 'Cadastrar checklist';
  }

  openActivityForm = function openIndependentChecklistForm(activityId = '') {
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
    if (index >= 0) state.activities[index] = control;
    else state.activities.unshift(control);

    closeModal('activityModal');
    saveState(isNew
      ? 'Checklist cadastrado. Abra-o para associar as filiais.'
      : 'Checklist e associações atualizados.');
  }, true);
})();
