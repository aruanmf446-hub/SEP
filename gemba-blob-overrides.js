'use strict';

function openGithubSettings() {
  const button = $('githubSettingsButton');
  setBusy(button, true, 'Verificando...');
  testBlobConnection()
    .then(status => showToast(`Vercel Blob conectado · acesso ${status.access}.`))
    .catch(error => showToast(error.message, 'error'))
    .finally(() => setBusy(button, false));
}

saveTemplate = async function saveTemplateToBlob(event) {
  event.preventDefault();
  if (!editingItems.length) { showToast('Adicione pelo menos um item.', 'error'); return; }
  const submitButton = event.submitter || $('templateForm').querySelector('button[type="submit"]');
  setBusy(submitButton, true, 'Salvando...');
  try {
    const currentSlug = $('templateId').value;
    const slug = currentSlug || `${slugify($('templateTitle').value)}-${Date.now().toString(36)}`;
    const items = [];
    for (let index = 0; index < editingItems.length; index++) {
      const item = { ...editingItems[index] };
      delete item.modelImageData;
      if (editingItems[index].modelImageData) {
        const imagePath = `dados/checklists/${slug}/modelos/${item.id}.jpg`;
        await putContent(imagePath, editingItems[index].modelImageData.split(',')[1], `Atualizar foto-modelo: ${$('templateTitle').value}`);
        item.modelImagePath = imagePath;
      }
      items.push(item);
    }
    const model = {
      id: editingTemplate?.id || uid(),
      slug,
      title: $('templateTitle').value.trim(),
      type: $('templateType').value,
      area: $('templateArea').value.trim(),
      description: $('templateDescription').value.trim(),
      items,
      createdAt: editingTemplate?.createdAt || nowIso(),
      updatedAt: nowIso(),
    };
    await putJson(`dados/checklists/${slug}/modelo.json`, model, `${editingTemplate ? 'Atualizar' : 'Criar'} modelo Gemba: ${model.title}`);
    closeModal('templateModal');
    showToast('Modelo salvo no Vercel Blob.');
    await loadAdminData();
  } catch (error) { showToast(error.message, 'error'); }
  finally { setBusy(submitButton, false); }
};

saveReview = async function saveReviewToBlob(event) {
  event.preventDefault();
  const button = event.submitter;
  setBusy(button, true, 'Salvando...');
  try {
    const checklistSlug = $('reviewChecklistId').value;
    const submissionId = $('reviewSubmissionId').value;
    const itemReviews = [];
    for (const answer of reviewContext.submission.items || []) {
      const decision = document.querySelector(`input[name="decision-${CSS.escape(answer.itemId)}"]:checked`)?.value;
      const comment = document.querySelector(`[data-review-comment="${CSS.escape(answer.itemId)}"]`)?.value.trim() || '';
      if (!decision) throw new Error('Avalie todos os itens.');
      if (decision === 'reprovado' && !comment) throw new Error('Informe o motivo dos itens reprovados.');
      itemReviews.push({ itemId: answer.itemId, decision, comment });
    }
    const status = itemReviews.some(item => item.decision === 'reprovado') ? 'reprovado' : 'aprovado';
    const review = { status, items: itemReviews, reviewedAt: nowIso(), reviewer: 'Gestor SEP' };
    await putJson(`dados/respostas/${checklistSlug}/${submissionId}/avaliacao.json`, review, `Avaliar checklist: ${reviewContext.submission.templateTitle}`);
    closeModal('reviewModal');
    if (status === 'reprovado') copyInspectorLink(checklistSlug, submissionId);
    showToast(status === 'aprovado' ? 'Checklist aprovado.' : 'Checklist reprovado. Link de correção copiado.');
    await loadAdminData();
  } catch (error) { showToast(error.message, 'error'); }
  finally { setBusy(button, false); }
};

copyInspectorLink = function copyBlobInspectorLink(slug, submissionId = '') {
  const url = new URL(window.location.href);
  url.pathname = url.pathname.replace(/[^/]+$/, 'gemba-blob.html');
  url.search = '';
  url.searchParams.set('mode', 'inspect');
  url.searchParams.set('checklist', slug);
  if (submissionId) {
    url.searchParams.set('submission', submissionId);
    url.searchParams.set('rework', '1');
  }
  navigator.clipboard.writeText(url.toString()).then(() => showToast('Link copiado.')).catch(() => prompt('Copie o link:', url.toString()));
};

submitInspection = async function submitInspectionToBlob(event) {
  const button = event.currentTarget;
  setBusy(button, true, 'Enviando fotos...');
  try {
    const submissionId = inspectorState.submissionId || `${new Date().toISOString().replace(/[:.]/g,'-')}-${slugify(inspectorState.inspector.name).slice(0,25)}`;
    const basePath = `dados/respostas/${inspectorState.checklistSlug}/${submissionId}`;
    const submittedItems = [];
    for (const item of inspectorState.items) {
      const answer = { ...(inspectorState.answers.get(item.id) || {}) };
      let photoPath = answer.photoPath || '';
      if (answer.photoData) {
        const suffix = inspectorState.reworkReview ? `-reenvio-${Date.now()}` : '';
        photoPath = `${basePath}/fotos/${item.id}${suffix}.jpg`;
        await putContent(photoPath, answer.photoData.split(',')[1], `Enviar evidência: ${inspectorState.model.title} — ${item.title}`);
      }
      submittedItems.push({ itemId: item.id, title: item.title, answer: answer.answer, observation: answer.observation || '', photoPath, submittedAt: nowIso() });
    }
    let response;
    if (inspectorState.reworkReview && inspectorState.oldSubmission) {
      const oldItems = inspectorState.oldSubmission.items || [];
      response = {
        ...inspectorState.oldSubmission,
        items: oldItems.map(oldItem => submittedItems.find(newItem => newItem.itemId === oldItem.itemId) || oldItem),
        lastResubmittedAt: nowIso(),
        resubmissionCount: Number(inspectorState.oldSubmission.resubmissionCount || 0) + 1,
        status: 'aguardando_avaliacao',
      };
    } else {
      response = {
        submissionId,
        checklistSlug: inspectorState.checklistSlug,
        templateTitle: inspectorState.model.title,
        inspector: inspectorState.inspector,
        branch: inspectorState.branch,
        automaticDate: new Date().toISOString().slice(0,10),
        submittedAt: nowIso(),
        status: 'aguardando_avaliacao',
        items: submittedItems,
      };
    }
    await putJson(`${basePath}/resposta.json`, response, `Receber checklist: ${inspectorState.model.title} — ${inspectorState.inspector.name}`);
    if (inspectorState.reworkReview) {
      await putJson(`${basePath}/avaliacao.json`, { ...inspectorState.reworkReview, status: 'aguardando_reavaliacao', resubmittedAt: nowIso() }, `Marcar checklist para reavaliação: ${inspectorState.model.title}`);
    }
    sessionStorage.removeItem(SESSION_KEY);
    $('inspectorContent').innerHTML = `<div class="inspector-card inspector-intro"><span class="gemba-type">Enviado</span><h1>Checklist concluído</h1><p>As respostas e fotos foram armazenadas no Vercel Blob e encaminhadas para avaliação.</p></div>`;
  } catch (error) { showToast(error.message, 'error'); }
  finally { setBusy(button, false); }
};

renderInspectorTokenRequest = function renderBlobUnavailable() {
  showToast('O envio usa a conexão segura com o Vercel Blob e não exige chave no celular.', 'error');
  renderInspectorReview();
};
