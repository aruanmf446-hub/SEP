function renderAdmin() {
  const pending = submissions.filter(item => !item.review).length;
  const rejected = reviews.filter(item => item.review?.status === 'reprovado').length;
  const approved = reviews.filter(item => item.review?.status === 'aprovado').length;
  $('summaryGrid').innerHTML = [
    ['Modelos ativos', templates.length], ['Aguardando avaliação', pending], ['Aprovados', approved], ['Com pendências', rejected]
  ].map(([label,value]) => `<article class="gemba-summary-card"><span>${label}</span><strong>${value}</strong></article>`).join('');
  renderTemplates(); renderSubmissions(); renderReviews();
}
function filteredBySearch(items, extractor) {
  const query = ($('gembaSearch')?.value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  if (!query) return items;
  return items.filter(item => extractor(item).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(query));
}
function renderTemplates() {
  const rows = filteredBySearch(templates, item => [item.title,item.description,item.type,item.area].join(' '));
  $('templateCount').textContent = `${rows.length} ${rows.length === 1 ? 'modelo' : 'modelos'}`;
  $('templateGrid').innerHTML = rows.length ? rows.map(template => {
    const submissionCount = submissions.filter(item => item.checklistSlug === template.slug).length;
    const pending = submissions.filter(item => item.checklistSlug === template.slug && !item.review).length;
    return `<article class="gemba-template-card"><div class="gemba-card-top"><span class="gemba-type">${escapeHTML(template.type || 'interno')}</span><button class="icon-button" data-edit-template="${escapeHTML(template.slug)}">⋯</button></div><h3>${escapeHTML(template.title)}</h3><p>${escapeHTML(template.description || template.area || 'Sem descrição')}</p><div class="gemba-template-stats"><div><strong>${(template.items || []).length}</strong><span>Itens</span></div><div><strong>${submissionCount}</strong><span>Envios</span></div><div><strong>${pending}</strong><span>Pendentes</span></div></div><div class="gemba-card-actions"><button class="button primary" data-copy-link="${escapeHTML(template.slug)}">Copiar link</button><button class="button secondary" data-edit-template="${escapeHTML(template.slug)}">Editar</button></div></article>`;
  }).join('') : `<div class="empty-state empty-state-wide"><strong>Nenhum modelo criado</strong><span>Crie o primeiro checklist Gemba com itens, instruções e fotos de referência.</span></div>`;
}
function statusFromSubmission(item) {
  if (!item.review || item.review.status === 'aguardando_reavaliacao') return ['Aguardando avaliação','pending'];
  return item.review.status === 'aprovado' ? ['Aprovado','approved'] : ['Reprovado','rejected'];
}

function renderSubmissions() {
  const rows = filteredBySearch(submissions, item => [item.templateTitle,item.inspector?.name,item.inspector?.identifier,item.branch,item.status].join(' '));
  $('submissionCount').textContent = `${rows.length} ${rows.length === 1 ? 'envio' : 'envios'}`;
  $('submissionList').innerHTML = rows.length ? rows.map(item => {
    const [label,cls] = statusFromSubmission(item);
    return `<article class="gemba-list-row"><div><h3>${escapeHTML(item.templateTitle)}</h3><p>${escapeHTML(item.inspector?.name || 'Inspetor não identificado')} · ${escapeHTML(item.branch || 'Sem filial')}</p></div><div class="gemba-list-cell"><span>Enviado em</span><strong>${formatDateTime(item.submittedAt)}</strong></div><div class="gemba-list-cell"><span>Itens</span><strong>${(item.items || []).length}</strong></div><div class="gemba-list-cell"><span class="gemba-status ${cls}">${label}</span></div><button class="button ${item.review ? 'secondary' : 'primary'}" data-review-submission="${escapeHTML(item.checklistSlug)}|${escapeHTML(item.submissionId)}">${item.review ? 'Ver avaliação' : 'Avaliar'}</button></article>`;
  }).join('') : `<div class="empty-state"><strong>Nenhum envio recebido</strong><span>Os checklists preenchidos pelos inspetores aparecerão aqui.</span></div>`;
}
function renderReviews() {
  const rows = filteredBySearch(reviews, item => [item.templateTitle,item.inspector?.name,item.branch,item.review?.status].join(' '));
  $('reviewCount').textContent = `${rows.length} ${rows.length === 1 ? 'avaliação' : 'avaliações'}`;
  $('reviewList').innerHTML = rows.length ? rows.map(item => {
    const [label,cls] = statusFromSubmission(item);
    const rejectedItems = item.review?.items?.filter(reviewItem => reviewItem.decision === 'reprovado').length || 0;
    return `<article class="gemba-list-row"><div><h3>${escapeHTML(item.templateTitle)}</h3><p>${escapeHTML(item.inspector?.name || 'Inspetor')} · ${escapeHTML(item.branch || 'Sem filial')}</p></div><div class="gemba-list-cell"><span>Avaliado em</span><strong>${formatDateTime(item.review?.reviewedAt)}</strong></div><div class="gemba-list-cell"><span>Itens reprovados</span><strong>${rejectedItems}</strong></div><div class="gemba-list-cell"><span class="gemba-status ${cls}">${label}</span></div><button class="button secondary" data-review-submission="${escapeHTML(item.checklistSlug)}|${escapeHTML(item.submissionId)}">Abrir</button></article>`;
  }).join('') : `<div class="empty-state"><strong>Nenhuma avaliação realizada</strong><span>O histórico de aprovações e reprovações aparecerá aqui.</span></div>`;
}

function openGithubSettings() {
  $('githubToken').value = config.token || '';
  $('githubOwner').value = config.owner;
  $('githubRepo').value = config.repo;
  $('githubBranch').value = config.branch;
  openModal('githubSettingsModal');
}
function defaultItem(index = 0) {
  return { id: uid(), title: `Item ${index + 1}`, area: '', guidance: '', photoRule: 'sim', observationRequired: false, modelImagePath: '', modelImageData: '' };
}
function openTemplateModal(slug = '') {
  editingTemplate = slug ? templates.find(item => item.slug === slug) : null;
  editingItems = (editingTemplate?.items || [defaultItem(0)]).map(item => ({ ...item }));
  $('templateForm').reset();
  $('templateId').value = editingTemplate?.slug || '';
  $('templateTitle').value = editingTemplate?.title || '';
  $('templateType').value = editingTemplate?.type || 'externo';
  $('templateArea').value = editingTemplate?.area || '';
  $('templateDescription').value = editingTemplate?.description || '';
  $('templateModalTitle').textContent = editingTemplate ? 'Editar checklist Gemba' : 'Novo checklist Gemba';
  $('deleteTemplateButton').hidden = !editingTemplate;
  renderTemplateItems();
  openModal('templateModal');
}
function renderTemplateItems() {
  $('templateItemList').innerHTML = editingItems.map((item,index) => `<article class="template-item-card" data-template-item="${item.id}"><div class="template-item-header"><span class="template-item-number">${index + 1}</span><strong>${escapeHTML(item.title || `Item ${index + 1}`)}</strong><button type="button" class="icon-button" data-remove-template-item="${item.id}" aria-label="Excluir item">×</button></div><div class="template-item-body"><div class="form-grid"><div class="field"><label>Título do item *</label><input value="${escapeHTML(item.title)}" data-item-field="title" data-item-id="${item.id}" required></div><div class="field"><label>Área / local</label><input value="${escapeHTML(item.area)}" data-item-field="area" data-item-id="${item.id}" placeholder="Ex.: Corredor de peças Volvo"></div><div class="field span-2"><label>Orientação para o inspetor</label><textarea rows="3" data-item-field="guidance" data-item-id="${item.id}" placeholder="Ex.: Fotografar somente a área identificada como Volvo, de frente, mostrando toda a placa">${escapeHTML(item.guidance)}</textarea></div><div class="field"><label>Regra da foto</label><select data-item-field="photoRule" data-item-id="${item.id}"><option value="sim" ${item.photoRule === 'sim' ? 'selected' : ''}>Obrigatória quando marcar Sim</option><option value="sempre" ${item.photoRule === 'sempre' ? 'selected' : ''}>Sempre obrigatória</option><option value="nao" ${item.photoRule === 'nao' ? 'selected' : ''}>Não exigir foto</option></select></div><div class="field"><label>Observação</label><select data-item-field="observationRequired" data-item-id="${item.id}"><option value="false" ${!item.observationRequired ? 'selected' : ''}>Opcional</option><option value="true" ${item.observationRequired ? 'selected' : ''}>Obrigatória</option></select></div><div class="field span-2"><label>Foto-modelo</label><div class="template-photo-panel"><div class="model-preview">${item.modelImageData ? `<img src="${item.modelImageData}" alt="Foto modelo">` : item.modelImagePath ? `<img src="${rawUrl(item.modelImagePath)}?v=${Date.now()}" alt="Foto modelo">` : '<span>Nenhuma foto-modelo anexada</span>'}</div><label class="file-drop"><input type="file" accept="image/*" data-model-image="${item.id}"><strong>Selecionar foto de exemplo</strong><span>Mostre o ângulo, a área e o padrão esperado.</span></label></div></div></div></div></article>`).join('');
}
async function saveTemplate(event) {
  event.preventDefault();
  if (!config.token) { openGithubSettings(); showToast('Configure a chave do GitHub antes de salvar.', 'error'); return; }
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
    const model = { id: editingTemplate?.id || uid(), slug, title: $('templateTitle').value.trim(), type: $('templateType').value, area: $('templateArea').value.trim(), description: $('templateDescription').value.trim(), items, createdAt: editingTemplate?.createdAt || nowIso(), updatedAt: nowIso() };
    await putJson(`dados/checklists/${slug}/modelo.json`, model, `${editingTemplate ? 'Atualizar' : 'Criar'} modelo Gemba: ${model.title}`);
    closeModal('templateModal');
    showToast('Modelo salvo no GitHub.');
    await loadAdminData();
  } catch (error) { showToast(error.message, 'error'); }
  finally { setBusy(submitButton, false); }
}
async function deleteTemplate() {
  showToast('A exclusão física de pastas será adicionada depois. Para preservar o histórico, o modelo não foi apagado.', 'error');
}
function copyInspectorLink(slug, submissionId = '') {
  const url = new URL('./gemba.html', window.location.href);
  url.searchParams.set('mode','inspect');
  url.searchParams.set('checklist',slug);
  if (submissionId) { url.searchParams.set('submission',submissionId); url.searchParams.set('rework','1'); }
  navigator.clipboard.writeText(url.toString()).then(() => showToast('Link copiado.')).catch(() => prompt('Copie o link:', url.toString()));
}

async function openReview(checklistSlug, submissionId) {
  const submission = submissions.find(item => item.checklistSlug === checklistSlug && item.submissionId === submissionId);
  if (!submission) return;
  const template = templates.find(item => item.slug === checklistSlug) || (await readJson(`dados/checklists/${checklistSlug}/modelo.json`)).data;
  reviewContext = { submission, template };
  $('reviewChecklistId').value = checklistSlug;
  $('reviewSubmissionId').value = submissionId;
  $('reviewModalTitle').textContent = submission.templateTitle;
  $('reviewModalSubtitle').textContent = `${submission.inspector?.name || 'Inspetor'} · ${submission.branch || 'Sem filial'} · ${formatDateTime(submission.submittedAt)}`;
  const previous = submission.review;
  $('reviewItemList').innerHTML = (submission.items || []).map((answer,index) => {
    const modelItem = template.items.find(item => item.id === answer.itemId) || {};
    const oldDecision = previous?.items?.find(item => item.itemId === answer.itemId);
    return `<article class="review-item" data-review-item="${answer.itemId}"><div class="review-item-head"><div><h3>${index + 1}. ${escapeHTML(answer.title || modelItem.title)}</h3><p>${escapeHTML(modelItem.area || '')}</p></div><span class="gemba-status ${answer.answer === 'sim' ? 'approved' : 'rejected'}">Resposta: ${answer.answer === 'sim' ? 'Sim' : 'Não'}</span></div><div class="review-images"><div><div class="review-image">${modelItem.modelImagePath ? `<img src="${rawUrl(modelItem.modelImagePath)}" alt="Modelo">` : '<span>Sem foto-modelo</span>'}</div><span>Modelo de exemplo</span></div><div><div class="review-image">${answer.photoPath ? `<img src="${rawUrl(answer.photoPath)}" alt="Foto do inspetor">` : '<span>O inspetor não enviou foto</span>'}</div><span>Foto enviada</span></div></div><div class="review-details"><p><strong>Observação do inspetor:</strong> ${escapeHTML(answer.observation || 'Sem observação')}</p><div class="review-decision"><label><input type="radio" name="decision-${answer.itemId}" value="aprovado" ${oldDecision?.decision === 'aprovado' ? 'checked' : ''} required> Aprovar item</label><label><input type="radio" name="decision-${answer.itemId}" value="reprovado" ${oldDecision?.decision === 'reprovado' ? 'checked' : ''} required> Reprovar item</label></div><div class="field review-comment"><label>Motivo / orientação para refazer</label><textarea rows="2" data-review-comment="${answer.itemId}" placeholder="Ex.: Fotografar somente a área Volvo; não é necessário mostrar SDLG">${escapeHTML(oldDecision?.comment || '')}</textarea></div></div></article>`;
  }).join('');
  openModal('reviewModal');
}
async function saveReview(event) {
  event.preventDefault();
  if (!config.token) { openGithubSettings(); return; }
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
}
