'use strict';

const SEP_BLOB_API = 'https://sep-gemba.vercel.app/api/blob';

// Garante que qualquer navegador, inclusive o celular do inspetor, use a API segura da Vercel.
if (!config.apiBase || config.apiBase === '/api/blob' || /github\.io\/api\/blob/i.test(config.apiBase)) {
  saveConfig({ ...config, apiBase: SEP_BLOB_API });
}

function originalMimeFromDataUrl(dataUrl = '') {
  return String(dataUrl).match(/^data:([^;,]+)[;,]/i)?.[1] || 'image/jpeg';
}

function originalExtension(mime = '') {
  const value = String(mime).toLowerCase();
  if (value.includes('png')) return 'png';
  if (value.includes('webp')) return 'webp';
  if (value.includes('heic')) return 'heic';
  if (value.includes('heif')) return 'heif';
  if (value.includes('gif')) return 'gif';
  return 'jpg';
}

function originalSizeFromDataUrl(dataUrl = '') {
  const base64 = String(dataUrl).split(',')[1] || '';
  const padding = (base64.match(/=*$/)?.[0] || '').length;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function formatImageSize(bytes) {
  const value = Number(bytes || 0);
  if (!value) return 'tamanho não informado';
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(2).replace('.', ',')} MB`;
}

function safeDownloadName(value = 'foto') {
  const clean = String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140);
  return clean || 'foto';
}

async function putOriginalContent(path, dataUrl, message = '') {
  const mime = originalMimeFromDataUrl(dataUrl);
  const base64 = String(dataUrl).split(',')[1] || '';
  if (!base64) throw new Error('A foto original não pôde ser preparada para o envio.');
  return blobRequest('put-base64', {
    method: 'POST',
    body: {
      path: blobPath(path),
      base64,
      contentType: mime,
      message,
    },
  });
}

// Não redimensiona, não converte e não recomprime: mantém o arquivo recebido do aparelho.
compressImage = async function preserveOriginalImage(file) {
  if (!file || !String(file.type || '').startsWith('image/')) {
    throw new Error('Selecione um arquivo de imagem válido.');
  }
  const dataUrl = await fileToDataUrl(file);
  return {
    dataUrl,
    base64: dataUrl.split(',')[1] || '',
    mime: file.type || originalMimeFromDataUrl(dataUrl),
    size: file.size || originalSizeFromDataUrl(dataUrl),
    name: file.name || 'foto-original',
    original: true,
  };
};

async function downloadOriginalPhoto(path, filename, button) {
  if (!path) return;
  setBusy(button, true, 'Baixando...');
  try {
    const response = await fetch(rawUrl(path), { cache: 'no-store' });
    if (!response.ok) throw new Error(`Não foi possível baixar a imagem (${response.status}).`);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = safeDownloadName(filename || `foto.${originalExtension(blob.type)}`);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    setBusy(button, false);
  }
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-download-photo]');
  if (!button) return;
  event.preventDefault();
  downloadOriginalPhoto(button.dataset.downloadPhoto, button.dataset.downloadName, button);
});

function openGithubSettings() {
  const button = $('githubSettingsButton');
  setBusy(button, true, 'Verificando...');
  testBlobConnection()
    .then(status => showToast(`Vercel Blob conectado · ${status.objects ?? 0} arquivo(s).`))
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
        const mime = originalMimeFromDataUrl(editingItems[index].modelImageData);
        const imagePath = `dados/checklists/${slug}/modelos/${item.id}.${originalExtension(mime)}`;
        await putOriginalContent(imagePath, editingItems[index].modelImageData, `Atualizar foto-modelo: ${$('templateTitle').value}`);
        item.modelImagePath = imagePath;
        item.modelImageMime = mime;
        item.modelImageSize = originalSizeFromDataUrl(editingItems[index].modelImageData);
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

openReview = async function openReviewWithOriginalDownload(checklistSlug, submissionId) {
  const submission = submissions.find(item => item.checklistSlug === checklistSlug && item.submissionId === submissionId);
  if (!submission) return;
  const template = templates.find(item => item.slug === checklistSlug) || (await readJson(`dados/checklists/${checklistSlug}/modelo.json`)).data;
  reviewContext = { submission, template };
  $('reviewChecklistId').value = checklistSlug;
  $('reviewSubmissionId').value = submissionId;
  $('reviewModalTitle').textContent = submission.templateTitle;
  $('reviewModalSubtitle').textContent = `${submission.inspector?.name || 'Inspetor'} · ${submission.branch || 'Sem filial'} · ${formatDateTime(submission.submittedAt)}`;
  const previous = submission.review;

  $('reviewItemList').innerHTML = (submission.items || []).map((answer, index) => {
    const modelItem = template.items.find(item => item.id === answer.itemId) || {};
    const oldDecision = previous?.items?.find(item => item.itemId === answer.itemId);
    const photoUrl = answer.photoPath ? rawUrl(answer.photoPath) : '';
    const extension = originalExtension(answer.photoMime || answer.photoPath || 'image/jpeg');
    const filename = safeDownloadName(`${submission.templateTitle}-${submission.branch || 'filial'}-${answer.title || modelItem.title || `item-${index + 1}`}.${extension}`);
    const quality = answer.photoPath
      ? `<small class="image-quality">Original do inspetor · ${escapeHTML(formatImageSize(answer.photoSize))}${answer.photoMime ? ` · ${escapeHTML(answer.photoMime)}` : ''}</small>`
      : '';
    const photoActions = answer.photoPath
      ? `<div class="image-actions"><a class="button secondary compact-button" href="${escapeHTML(photoUrl)}" target="_blank" rel="noopener">Abrir original</a><button type="button" class="button primary compact-button" data-download-photo="${escapeHTML(answer.photoPath)}" data-download-name="${escapeHTML(filename)}">Baixar imagem</button></div>`
      : '';

    return `<article class="review-item" data-review-item="${answer.itemId}"><div class="review-item-head"><div><h3>${index + 1}. ${escapeHTML(answer.title || modelItem.title)}</h3><p>${escapeHTML(modelItem.area || '')}</p></div><span class="gemba-status ${answer.answer === 'sim' ? 'approved' : 'rejected'}">Resposta: ${answer.answer === 'sim' ? 'Sim' : 'Não'}</span></div><div class="review-images"><div><div class="review-image">${modelItem.modelImagePath ? `<img src="${rawUrl(modelItem.modelImagePath)}" alt="Modelo">` : '<span>Sem foto-modelo</span>'}</div><span>Modelo de exemplo</span></div><div><div class="review-image">${answer.photoPath ? `<img src="${photoUrl}" alt="Foto original do inspetor">` : '<span>O inspetor não enviou foto</span>'}</div><span>Foto enviada</span>${quality}${photoActions}</div></div><div class="review-details"><p><strong>Observação do inspetor:</strong> ${escapeHTML(answer.observation || 'Sem observação')}</p><div class="review-decision"><label><input type="radio" name="decision-${answer.itemId}" value="aprovado" ${oldDecision?.decision === 'aprovado' ? 'checked' : ''} required> Aprovar item</label><label><input type="radio" name="decision-${answer.itemId}" value="reprovado" ${oldDecision?.decision === 'reprovado' ? 'checked' : ''} required> Reprovar item</label></div><div class="field review-comment"><label>Motivo / orientação para refazer</label><textarea rows="2" data-review-comment="${answer.itemId}" placeholder="Ex.: Fotografar somente a área Volvo; não é necessário mostrar SDLG">${escapeHTML(oldDecision?.comment || '')}</textarea></div></div></article>`;
  }).join('');
  openModal('reviewModal');
};

submitInspection = async function submitInspectionToBlob(event) {
  const button = event.currentTarget;
  setBusy(button, true, 'Enviando originais...');
  try {
    const submissionId = inspectorState.submissionId || `${new Date().toISOString().replace(/[:.]/g,'-')}-${slugify(inspectorState.inspector.name).slice(0,25)}`;
    const basePath = `dados/respostas/${inspectorState.checklistSlug}/${submissionId}`;
    const submittedItems = [];
    for (const item of inspectorState.items) {
      const answer = { ...(inspectorState.answers.get(item.id) || {}) };
      let photoPath = answer.photoPath || '';
      let photoMime = answer.photoMime || '';
      let photoSize = Number(answer.photoSize || 0);
      if (answer.photoData) {
        photoMime = originalMimeFromDataUrl(answer.photoData);
        photoSize = originalSizeFromDataUrl(answer.photoData);
        const suffix = inspectorState.reworkReview ? `-reenvio-${Date.now()}` : '';
        photoPath = `${basePath}/fotos/${item.id}${suffix}.${originalExtension(photoMime)}`;
        await putOriginalContent(photoPath, answer.photoData, `Enviar evidência original: ${inspectorState.model.title} — ${item.title}`);
      }
      submittedItems.push({
        itemId: item.id,
        title: item.title,
        answer: answer.answer,
        observation: answer.observation || '',
        photoPath,
        photoMime,
        photoSize,
        photoOriginal: Boolean(photoPath),
        submittedAt: nowIso(),
      });
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
        imageStorage: 'original',
        items: submittedItems,
      };
    }
    await putJson(`${basePath}/resposta.json`, response, `Receber checklist: ${inspectorState.model.title} — ${inspectorState.inspector.name}`);
    if (inspectorState.reworkReview) {
      await putJson(`${basePath}/avaliacao.json`, { ...inspectorState.reworkReview, status: 'aguardando_reavaliacao', resubmittedAt: nowIso() }, `Marcar checklist para reavaliação: ${inspectorState.model.title}`);
    }
    sessionStorage.removeItem(SESSION_KEY);
    $('inspectorContent').innerHTML = `<div class="inspector-card inspector-intro"><span class="gemba-type">Enviado</span><h1>Checklist concluído</h1><p>As respostas e as fotos originais foram armazenadas no Vercel Blob e encaminhadas para avaliação.</p></div>`;
  } catch (error) { showToast(error.message, 'error'); }
  finally { setBusy(button, false); }
};

renderInspectorTokenRequest = function renderBlobUnavailable() {
  showToast('O envio usa a conexão segura com o Vercel Blob e não exige chave no celular.', 'error');
  renderInspectorReview();
};
