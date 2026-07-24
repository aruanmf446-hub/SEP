'use strict';

(function applyGembaAssignment() {
  let pendingAssignment = null;
  let pendingBranch = '';
  const baseInitInspector = initInspector;
  const baseSubmitInspection = submitInspection;

  function assignmentFromParams(params) {
    const name = params.get('responsavel') || '';
    const personId = params.get('responsavelId') || '';
    const role = params.get('responsavelFuncao') || '';
    const contact = params.get('responsavelContato') || '';
    const controlId = params.get('controle') || '';
    const controlTitle = params.get('controleNome') || '';
    if (!name && !personId && !controlId) return null;
    return { personId, name, role, contact, controlId, controlTitle, linkedAt: nowIso() };
  }

  function resolvedAssignment() {
    return inspectorState?.assignment || inspectorState?.oldSubmission?.assignment || pendingAssignment || null;
  }

  initInspector = async function initInspectorWithAssignment(params) {
    pendingAssignment = assignmentFromParams(params);
    pendingBranch = params.get('filial') || '';
    await baseInitInspector(params);
    if (!inspectorState) return;
    inspectorState.assignment = pendingAssignment || inspectorState.oldSubmission?.assignment || null;
    inspectorState.sourceControl = inspectorState.assignment ? {
      id: inspectorState.assignment.controlId || '',
      title: inspectorState.assignment.controlTitle || ''
    } : inspectorState.oldSubmission?.sourceControl || null;
    inspectorState.prefilledBranch = pendingBranch || inspectorState.oldSubmission?.branch || '';
    renderInspectorIntro();
  };

  renderInspectorIntro = function renderAssignedInspectorIntro() {
    const model = inspectorState.model;
    const isRework = Boolean(inspectorState.reworkReview);
    const assignment = resolvedAssignment();
    const assignedName = assignment?.name || inspectorState.oldSubmission?.inspector?.name || '';
    const assignedMeta = [assignment?.role, assignment?.contact].filter(Boolean).join(' · ');
    const assignedCard = assignment?.name ? `<div class="assigned-inspector"><span>Responsável pela inspeção</span><strong>${escapeHTML(assignment.name)}</strong>${assignedMeta ? `<small>${escapeHTML(assignedMeta)}</small>` : ''}</div>` : '';
    const controlReference = assignment?.controlTitle ? `<div class="inspection-reference"><span>Referência do controle</span><strong>${escapeHTML(assignment.controlTitle)}</strong></div>` : '';

    $('inspectorContent').innerHTML = `<div class="inspector-card inspector-intro"><span class="gemba-type">${isRework ? 'Correção de pendências' : escapeHTML(model.type || 'interno')}</span><h1>${escapeHTML(model.title)}</h1><p>${escapeHTML(isRework ? 'Refaça somente os itens reprovados na avaliação anterior.' : model.description || 'Siga as orientações e registre as evidências solicitadas.')}</p>${assignedCard}${controlReference}<div class="inspector-meta"><span>${inspectorState.items.length} itens</span><span>${escapeHTML(model.area || 'Área não informada')}</span><span>Data automática</span></div><form id="inspectorIdentityForm"><div class="form-grid"><div class="field"><label>Seu nome *</label><input id="inspectorName" required value="${escapeHTML(assignedName)}" ${assignment?.name ? 'readonly' : ''}></div><div class="field"><label>Matrícula / identificação</label><input id="inspectorIdentifier" value="${escapeHTML(inspectorState.oldSubmission?.inspector?.identifier || '')}"></div><div class="field span-2"><label>Filial / unidade *</label><input id="inspectorBranch" required value="${escapeHTML(inspectorState.prefilledBranch || pendingBranch || inspectorState.oldSubmission?.branch || '')}" placeholder="Ex.: Marituba"></div></div><div class="modal-actions"><div class="spacer"></div><button class="button primary" type="submit">Iniciar checklist</button></div></form></div>`;

    $('inspectorIdentityForm').addEventListener('submit', event => {
      event.preventDefault();
      inspectorState.assignment = assignment || null;
      inspectorState.inspector = {
        name: $('inspectorName').value.trim(),
        identifier: $('inspectorIdentifier').value.trim(),
        assignedPersonId: assignment?.personId || ''
      };
      inspectorState.branch = $('inspectorBranch').value.trim();
      inspectorState.step = 0;
      renderInspectorStep();
    });
  };

  submitInspection = async function submitAssignedInspection(event) {
    const originalPutJson = putJson;
    let responseSaved = false;

    putJson = async function putJsonWithAssignment(path, data, message = '') {
      if (/\/resposta\.json$/.test(path)) {
        data = {
          ...data,
          assignment: resolvedAssignment(),
          sourceControl: inspectorState?.sourceControl || null
        };
      }
      const result = await originalPutJson(path, data, message);
      if (/\/resposta\.json$/.test(path)) responseSaved = true;
      return result;
    };

    try {
      await baseSubmitInspection(event);
      if (responseSaved) {
        $('inspectorContent').innerHTML = '<div class="inspector-card inspector-finished"><h1>Checklist realizado.</h1></div>';
      }
    } finally {
      putJson = originalPutJson;
    }
  };
})();
