function bindEvents() {
  $('menuButton').addEventListener('click', () => $('sidebar').classList.toggle('open'));
  $('githubSettingsButton').addEventListener('click', openGithubSettings);
  $('newTemplateButton').addEventListener('click', () => openTemplateModal());
  $('refreshDataButton').addEventListener('click', loadAdminData);
  $('gembaSearch').addEventListener('input', () => { renderTemplates(); renderSubmissions(); renderReviews(); });
  document.querySelectorAll('[data-close-modal]').forEach(button => button.addEventListener('click', () => closeModal(button.dataset.closeModal)));
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => backdrop.addEventListener('click', event => { if (event.target === backdrop) closeModal(backdrop.id); }));
  document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => {
    activeTab = button.dataset.tab;
    document.querySelectorAll('[data-tab]').forEach(item => item.classList.toggle('active', item === button));
    document.querySelectorAll('.gemba-tab-view').forEach(view => view.classList.toggle('active', view.id === `tab-${activeTab}`));
  }));
  $('addTemplateItemButton').addEventListener('click', () => { editingItems.push(defaultItem(editingItems.length)); renderTemplateItems(); });
  $('templateItemList').addEventListener('input', event => {
    const field = event.target.closest('[data-item-field]');
    if (!field) return;
    const item = editingItems.find(value => value.id === field.dataset.itemId);
    if (!item) return;
    item[field.dataset.itemField] = field.dataset.itemField === 'observationRequired' ? field.value === 'true' : field.value;
    if (field.dataset.itemField === 'title') field.closest('.template-item-card')?.querySelector('.template-item-header strong')?.replaceChildren(document.createTextNode(field.value || 'Item'));
  });
  $('templateItemList').addEventListener('change', async event => {
    const imageInput = event.target.closest('[data-model-image]');
    if (!imageInput) return;
    const file = imageInput.files?.[0];
    if (!file) return;
    const item = editingItems.find(value => value.id === imageInput.dataset.modelImage);
    const compressed = await compressImage(file);
    item.modelImageData = compressed.dataUrl;
    renderTemplateItems();
  });
  $('templateItemList').addEventListener('click', event => {
    const remove = event.target.closest('[data-remove-template-item]');
    if (!remove) return;
    if (editingItems.length === 1) { showToast('O checklist precisa ter pelo menos um item.', 'error'); return; }
    editingItems = editingItems.filter(item => item.id !== remove.dataset.removeTemplateItem);
    renderTemplateItems();
  });
  $('templateForm').addEventListener('submit', saveTemplate);
  $('deleteTemplateButton').addEventListener('click', deleteTemplate);
  $('reviewForm').addEventListener('submit', saveReview);
  document.addEventListener('click', event => {
    const edit = event.target.closest('[data-edit-template]'); if (edit) openTemplateModal(edit.dataset.editTemplate);
    const copy = event.target.closest('[data-copy-link]'); if (copy) copyInspectorLink(copy.dataset.copyLink);
    const review = event.target.closest('[data-review-submission]'); if (review) { const [slug,id] = review.dataset.reviewSubmission.split('|'); openReview(slug,id); }
  });
}

async function init() {
  const params = new URLSearchParams(location.search);
  if (params.get('mode') === 'inspect') { await initInspector(params); return; }
  bindEvents();
  renderAdmin();
  try {
    const status = await testBlobConnection();
    $('githubSettingsButton').textContent = 'Blob conectado';
    $('githubSettingsButton').title = `Vercel Blob · acesso ${status.access}`;
  } catch (error) {
    $('githubSettingsButton').textContent = 'Verificar Blob';
    showToast(error.message, 'error');
  }
  await loadAdminData();
}

document.addEventListener('DOMContentLoaded', init);
