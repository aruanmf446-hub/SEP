async function initInspector(params) {
  $('adminShell').classList.add('hidden');
  $('inspectorShell').classList.remove('hidden');
  $('inspectorDate').textContent = new Intl.DateTimeFormat('pt-BR',{ dateStyle:'full' }).format(new Date());
  const checklistSlug = params.get('checklist');
  const submissionId = params.get('submission');
  try {
    const modelFile = await readJson(`dados/checklists/${checklistSlug}/modelo.json`);
    let reworkReview = null;
    let oldSubmission = null;
    if (submissionId && params.get('rework') === '1') {
      oldSubmission = (await readJson(`dados/respostas/${checklistSlug}/${submissionId}/resposta.json`)).data;
      reworkReview = (await readJson(`dados/respostas/${checklistSlug}/${submissionId}/avaliacao.json`)).data;
    }
    const items = reworkReview ? modelFile.data.items.filter(item => reworkReview.items.some(reviewItem => reviewItem.itemId === item.id && reviewItem.decision === 'reprovado')) : modelFile.data.items;
    inspectorState = { model: modelFile.data, checklistSlug, submissionId, oldSubmission, reworkReview, items, answers: new Map(), step: -1, inspector: {}, branch: '' };
    renderInspectorIntro();
  } catch (error) {
    $('inspectorContent').innerHTML = `<div class="inspector-card inspector-intro"><h1>Não foi possível abrir o checklist</h1><p>${escapeHTML(error.message)}</p></div>`;
  }
}
function renderInspectorIntro() {
  const model = inspectorState.model;
  const isRework = Boolean(inspectorState.reworkReview);
  $('inspectorContent').innerHTML = `<div class="inspector-card inspector-intro"><span class="gemba-type">${isRework ? 'Correção de pendências' : escapeHTML(model.type || 'interno')}</span><h1>${escapeHTML(model.title)}</h1><p>${escapeHTML(isRework ? 'Refaça somente os itens reprovados na avaliação anterior.' : model.description || 'Siga as orientações e registre as evidências solicitadas.')}</p><div class="inspector-meta"><span>${inspectorState.items.length} itens</span><span>${escapeHTML(model.area || 'Área não informada')}</span><span>Data automática</span></div><form id="inspectorIdentityForm"><div class="form-grid"><div class="field"><label>Seu nome *</label><input id="inspectorName" required value="${escapeHTML(inspectorState.oldSubmission?.inspector?.name || '')}"></div><div class="field"><label>Matrícula / identificação</label><input id="inspectorIdentifier" value="${escapeHTML(inspectorState.oldSubmission?.inspector?.identifier || '')}"></div><div class="field span-2"><label>Filial / unidade *</label><input id="inspectorBranch" required value="${escapeHTML(inspectorState.oldSubmission?.branch || '')}" placeholder="Ex.: Marituba"></div></div><div class="modal-actions"><div class="spacer"></div><button class="button primary" type="submit">Iniciar checklist</button></div></form></div>`;
  $('inspectorIdentityForm').addEventListener('submit', event => { event.preventDefault(); inspectorState.inspector = { name: $('inspectorName').value.trim(), identifier: $('inspectorIdentifier').value.trim() }; inspectorState.branch = $('inspectorBranch').value.trim(); inspectorState.step = 0; renderInspectorStep(); });
}
function currentInspectorItem() { return inspectorState.items[inspectorState.step]; }
function renderInspectorStep() {
  const item = currentInspectorItem();
  const answer = inspectorState.answers.get(item.id) || { answer: '', observation: '', photoData: '', photoPath: '' };
  const reviewNote = inspectorState.reworkReview?.items?.find(reviewItem => reviewItem.itemId === item.id)?.comment;
  const progress = Math.round(((inspectorState.step) / inspectorState.items.length) * 100);
  $('inspectorContent').innerHTML = `<div class="inspector-card"><div class="inspector-progress"><div class="inspector-progress-head"><span>Item ${inspectorState.step + 1} de ${inspectorState.items.length}</span><strong>${progress}%</strong></div><div class="bar-track"><div class="bar-fill" style="width:${progress}%"></div></div></div><section class="inspector-item"><span class="inspector-item-area">${escapeHTML(item.area || inspectorState.model.area || 'Conferência')}</span><h2>${escapeHTML(item.title)}</h2>${reviewNote ? `<div class="activity-note"><strong>Motivo da reprovação:</strong> ${escapeHTML(reviewNote)}</div>` : ''}<div class="inspector-guidance">${escapeHTML(item.guidance || 'Verifique o item conforme o padrão do checklist.')}</div>${item.modelImagePath ? `<div class="inspector-model"><img src="${rawUrl(item.modelImagePath)}" alt="Modelo de exemplo"><small>Modelo de exemplo — use este enquadramento e área como referência.</small></div>` : ''}<div class="field"><label>A condição está conforme?</label><div class="answer-buttons"><button type="button" class="answer-button yes ${answer.answer === 'sim' ? 'selected' : ''}" data-answer="sim">Sim</button><button type="button" class="answer-button no ${answer.answer === 'nao' ? 'selected' : ''}" data-answer="nao">Não</button></div></div><div class="capture-area ${shouldShowCapture(item,answer.answer) ? '' : 'hidden'}" id="captureArea"><label class="capture-button"><input id="inspectorPhotoInput" type="file" accept="image/*" capture="environment">Tirar ou anexar foto</label><div class="captured-preview">${answer.photoData ? `<img src="${answer.photoData}" alt="Foto anexada">` : answer.photoPath ? `<img src="${rawUrl(answer.photoPath)}" alt="Foto anterior">` : ''}</div></div><div class="field"><label>Observação ${item.observationRequired ? '*' : '(opcional)'}</label><textarea id="inspectorObservation" rows="3" placeholder="Descreva o que encontrou">${escapeHTML(answer.observation)}</textarea></div></section><div class="inspector-actions"><button class="button secondary" id="previousInspectorButton" ${inspectorState.step === 0 ? 'disabled' : ''}>Voltar</button><button class="button primary" id="nextInspectorButton">${inspectorState.step === inspectorState.items.length - 1 ? 'Revisar e concluir' : 'Próximo item'}</button></div></div>`;
  document.querySelectorAll('[data-answer]').forEach(button => button.addEventListener('click', () => { answer.answer = button.dataset.answer; inspectorState.answers.set(item.id,answer); renderInspectorStep(); }));
  $('inspectorPhotoInput')?.addEventListener('change', async event => { const file = event.target.files?.[0]; if (!file) return; const image = await compressImage(file); answer.photoData = image.dataUrl; inspectorState.answers.set(item.id,answer); renderInspectorStep(); });
  $('previousInspectorButton').addEventListener('click', () => { persistInspectorAnswer(); inspectorState.step--; renderInspectorStep(); });
  $('nextInspectorButton').addEventListener('click', () => { if (!validateInspectorItem(item, answer)) return; persistInspectorAnswer(); if (inspectorState.step === inspectorState.items.length - 1) renderInspectorReview(); else { inspectorState.step++; renderInspectorStep(); } });
}
function shouldShowCapture(item, answer) { return item.photoRule === 'sempre' || (item.photoRule === 'sim' && answer === 'sim'); }
function persistInspectorAnswer() { const item = currentInspectorItem(); const answer = inspectorState.answers.get(item.id) || {}; answer.observation = $('inspectorObservation')?.value.trim() || ''; inspectorState.answers.set(item.id,answer); }
function validateInspectorItem(item, answer) {
  answer.observation = $('inspectorObservation')?.value.trim() || '';
  if (!answer.answer) { showToast('Marque Sim ou Não.', 'error'); return false; }
  if (shouldShowCapture(item,answer.answer) && !answer.photoData && !answer.photoPath) { showToast('Anexe a foto solicitada.', 'error'); return false; }
  if (item.observationRequired && !answer.observation) { showToast('Preencha a observação.', 'error'); return false; }
  inspectorState.answers.set(item.id,answer); return true;
}
function renderInspectorReview() {
  const rows = inspectorState.items.map((item,index) => { const answer = inspectorState.answers.get(item.id); return `<div class="gemba-list-row"><div><h3>${index + 1}. ${escapeHTML(item.title)}</h3><p>${escapeHTML(answer?.observation || 'Sem observação')}</p></div><div class="gemba-list-cell"><span>Resposta</span><strong>${answer?.answer === 'sim' ? 'Sim' : 'Não'}</strong></div><div class="gemba-list-cell"><span>Foto</span><strong>${answer?.photoData || answer?.photoPath ? 'Anexada' : 'Não exigida'}</strong></div></div>`; }).join('');
  $('inspectorContent').innerHTML = `<div class="inspector-card inspector-intro"><h1>Confirmar envio</h1><p>Revise as respostas antes de concluir o checklist.</p><div class="gemba-list">${rows}</div><div class="modal-actions"><button class="button secondary" id="backToItemsButton">Voltar</button><div class="spacer"></div><button class="button primary" id="submitInspectionButton">Concluir checklist</button></div></div>`;
  $('backToItemsButton').addEventListener('click', () => { inspectorState.step = inspectorState.items.length - 1; renderInspectorStep(); });
  $('submitInspectionButton').addEventListener('click', submitInspection);
}
async function submitInspection(event) {
  const button = event.currentTarget;
  if (!config.token) { renderInspectorTokenRequest(); return; }
  setBusy(button,true,'Enviando fotos...');
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
      response = { ...inspectorState.oldSubmission, items: oldItems.map(oldItem => submittedItems.find(newItem => newItem.itemId === oldItem.itemId) || oldItem), lastResubmittedAt: nowIso(), resubmissionCount: Number(inspectorState.oldSubmission.resubmissionCount || 0) + 1, status: 'aguardando_avaliacao' };
    } else {
      response = { submissionId, checklistSlug: inspectorState.checklistSlug, templateTitle: inspectorState.model.title, inspector: inspectorState.inspector, branch: inspectorState.branch, automaticDate: new Date().toISOString().slice(0,10), submittedAt: nowIso(), status: 'aguardando_avaliacao', items: submittedItems };
    }
    await putJson(`${basePath}/resposta.json`, response, `Receber checklist: ${inspectorState.model.title} — ${inspectorState.inspector.name}`);
    if (inspectorState.reworkReview) {
      await putJson(`${basePath}/avaliacao.json`, { ...inspectorState.reworkReview, status: 'aguardando_reavaliacao', resubmittedAt: nowIso() }, `Marcar checklist para reavaliação: ${inspectorState.model.title}`);
    }
    sessionStorage.removeItem(SESSION_KEY);
    $('inspectorContent').innerHTML = `<div class="inspector-card inspector-intro"><span class="gemba-type">Enviado</span><h1>Checklist concluído</h1><p>As respostas e fotos foram gravadas no GitHub e encaminhadas para avaliação.</p></div>`;
  } catch (error) { showToast(error.message,'error'); }
  finally { setBusy(button,false); }
}
function renderInspectorTokenRequest() {
  $('inspectorContent').innerHTML = `<div class="inspector-card inspector-intro"><h1>Chave interna necessária</h1><p>Para enviar fotos e respostas ao GitHub, informe a chave de gravação usada pela filial. Ela ficará somente neste navegador.</p><form id="inspectorTokenForm"><div class="field"><label>Chave interna GitHub *</label><input id="inspectorToken" type="password" required placeholder="github_pat_..."></div><div class="modal-actions"><button type="button" class="button secondary" id="returnInspectorReview">Voltar</button><div class="spacer"></div><button type="submit" class="button primary">Salvar e enviar</button></div></form></div>`;
  $('returnInspectorReview').addEventListener('click', renderInspectorReview);
  $('inspectorTokenForm').addEventListener('submit', event => { event.preventDefault(); saveConfig({ ...config, token: $('inspectorToken').value.trim() }); renderInspectorReview(); setTimeout(() => $('submitInspectionButton').click(), 50); });
}
