import { activateWarehouse, activeWarehouse, createWarehouse, deleteWarehouse, duplicateWarehouse, ensureMigrated, exportWarehouse, importWarehouse, getWarehouse, listWarehouses, persistActiveDraft, updateWarehouse, updateWarehouseInventory, warehouseSummary } from './slotlab-projects.js?v=79';
import { prepareWebMCPTool, validateWebMCPInput } from './webmcp-validation.mjs?v=73';

const $ = id => document.getElementById(id);
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const route = () => {
  const match = location.hash.match(/^#warehouse\/([^/]+)\/(design|products)$/);
  return match ? { page: 'warehouse', id: match[1], mode: match[2] } : { page: 'home' };
};
const relativeDate = iso => new Intl.DateTimeFormat('en-US', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

function projectCard(project) {
  const data = warehouseSummary(project);
  return `<article class="warehouse-card" data-id="${data.id}">
    <div class="warehouse-preview"><div class="preview-shell">${Array.from({ length: Math.min(data.racks, 9) }, (_, i) => `<i style="--x:${i % 5};--y:${Math.floor(i / 5)}"></i>`).join('')}<span>${data.dimensions.width} × ${data.dimensions.depth} m</span></div><b class="project-status">${escapeHtml(data.status)}</b></div>
    <div class="warehouse-card-body"><div class="card-title"><div><h3>${escapeHtml(data.name)}</h3><p>${escapeHtml(data.description || 'No description yet.')}</p></div><button class="icon-button" data-action="menu" aria-label="More actions">•••</button></div>
    <div class="project-metrics"><span><strong>${data.racks}</strong> racks</span><span><strong>${data.locations}</strong> locations</span><span><strong>${data.scenarios}</strong> scenarios</span></div>
    <div class="card-footer"><small>Updated ${relativeDate(data.updatedAt)}</small><button class="open-project" data-action="open">Open project <b>→</b></button></div>
    <div class="card-menu" hidden><button data-action="rename">Rename</button><button data-action="duplicate">Duplicate</button><button data-action="export">Export JSON</button><button data-action="archive">${project.archived ? 'Restore' : 'Archive'}</button><button class="danger" data-action="delete">Delete…</button></div></div>
  </article>`;
}

function downloadProject(project) {
  const data = exportWarehouse(project.id);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob); link.download = `${project.name.toLowerCase().replace(/[^a-z0-9]+/gi, '-')}.slotlab.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function openProject(id, mode = 'design') {
  persistActiveDraft();
  if (!activateWarehouse(id)) return false;
  history.replaceState(null, '', `${location.pathname}${location.search}#warehouse/${id}/${mode}`);
  location.reload();
  return true;
}

function renderHub(showArchived = false) {
  const projects = listWarehouses({ includeArchived: true }).filter(item => item.archived === showArchived);
  $('warehouse-grid').innerHTML = projects.length ? projects.map(projectCard).join('') : `<div class="empty-projects"><strong>${showArchived ? 'There are no archived warehouses' : 'Your library is empty'}</strong><p>${showArchived ? 'Archived projects will appear here.' : 'Create a warehouse from a blank canvas or a template.'}</p></div>`;
  $('active-count').textContent = listWarehouses().length;
  $('archived-count').textContent = listWarehouses({ includeArchived: true }).filter(item => item.archived).length;
  $('show-active').classList.toggle('active', !showArchived); $('show-archived').classList.toggle('active', showArchived);
}

function showCreateDialog() {
  const dialog = $('project-dialog');
  dialog.querySelector('form').reset();
  dialog.dataset.source = 'blank';
  dialog.dataset.template = 'picking';
  dialog.querySelectorAll('.source-option').forEach(option => option.classList.toggle('active', option.dataset.source === 'blank'));
  dialog.querySelectorAll('.template-option').forEach(option => option.classList.toggle('active', option.dataset.template === 'picking'));
  $('template-picker').hidden = true;
  dialog.showModal();
  setTimeout(() => $('project-name').focus(), 50);
}

export function showAppDialog({ title, message, confirmLabel = 'OK', cancelLabel = 'Cancel', inputLabel = '', inputValue = '', danger = false } = {}) {
  const dialog = $('app-dialog');
  if (!dialog) return Promise.resolve({ confirmed: false, value: null });
  const inputWrap = $('app-dialog-input-wrap');
  const input = $('app-dialog-input');
  const cancel = $('app-dialog-cancel');
  const confirm = $('app-dialog-confirm');
  $('app-dialog-title').textContent = title || 'SlotLab';
  $('app-dialog-message').textContent = message || '';
  $('app-dialog-input-label').textContent = inputLabel;
  inputWrap.hidden = !inputLabel;
  input.required = Boolean(inputLabel);
  input.value = inputValue;
  cancel.hidden = !cancelLabel;
  cancel.textContent = cancelLabel;
  confirm.textContent = confirmLabel;
  confirm.classList.toggle('danger-button', danger);
  dialog.returnValue = 'cancel';
  dialog.showModal();
  if (inputLabel) setTimeout(() => { input.focus(); input.select(); }, 30);
  else setTimeout(() => confirm.focus(), 30);
  return new Promise(resolve => dialog.addEventListener('close', () => resolve({ confirmed: dialog.returnValue === 'confirm', value: input.value.trim() }), { once: true }));
}

function registerProjectTools() {
  const mc = (navigator.modelContext ?? document.modelContext);
  if (!mc?.registerTool) return 0;
  const refreshOpenHub = () => {
    if (route().page === 'home' && $('warehouse-grid')) renderHub(Boolean($('show-archived')?.classList.contains('active')));
  };
  const tools = [
    { name: 'slotlab_list_warehouses', description: 'List Spacio warehouse projects with dimensions, rack capacity, status and last update.', inputSchema: { type: 'object', properties: { includeArchived: { type: 'boolean' } }, additionalProperties: false }, execute: async input => ({ warehouses: listWarehouses({ includeArchived: !!input.includeArchived }).map(warehouseSummary) }) },
    { name: 'slotlab_create_warehouse', description: 'Create an empty local warehouse project or start from one of three built-in spatial templates. It does not approve or physically execute a layout.', inputSchema: { type: 'object', properties: { name: { type: 'string', minLength: 1, maxLength: 120 }, description: { type: 'string', maxLength: 1000 }, template: { type: 'string', enum: ['blank', 'picking', 'pallet', 'cold'] } }, required: ['name'], additionalProperties: false }, execute: async input => { if (!input.name.trim()) return { ok: false, error: 'INVALID_NAME' }; const project = createWarehouse({ ...input, name: input.name.trim(), description: input.description?.trim() }); refreshOpenHub(); return { ok: true, warehouse: warehouseSummary(project) }; } },
    { name: 'slotlab_get_warehouse', description: 'Read one complete warehouse project, including its shared facility draft and scenarios.', inputSchema: { type: 'object', properties: { warehouseId: { type: 'string', minLength: 1, maxLength: 80 } }, required: ['warehouseId'], additionalProperties: false }, execute: async ({ warehouseId }) => getWarehouse(warehouseId) || { ok: false, error: 'UNKNOWN_WAREHOUSE' } },
    { name: 'slotlab_update_warehouse', description: 'Update warehouse project metadata such as name, description, intent or workflow status.', inputSchema: { type: 'object', properties: { warehouseId: { type: 'string', minLength: 1, maxLength: 80 }, name: { type: 'string', minLength: 1, maxLength: 120 }, description: { type: 'string', maxLength: 1000 }, intent: { type: 'string', maxLength: 1000 }, status: { type: 'string', enum: ['Draft', 'Ready', 'Approved'] } }, required: ['warehouseId'], additionalProperties: false }, execute: async ({ warehouseId, ...patch }) => { if (!Object.keys(patch).length) return { ok: false, error: 'NO_CHANGES' }; if (patch.name != null && !patch.name.trim()) return { ok: false, error: 'INVALID_NAME' }; if (patch.name != null) patch.name = patch.name.trim(); const project = updateWarehouse(warehouseId, patch); refreshOpenHub(); return project ? { ok: true, warehouse: warehouseSummary(project) } : { ok: false, error: 'UNKNOWN_WAREHOUSE' }; } },
    { name: 'slotlab_open_warehouse', description: 'Open an existing Spacio project in design or product-analysis mode for inspection and editing.', inputSchema: { type: 'object', properties: { warehouseId: { type: 'string' }, mode: { type: 'string', enum: ['design', 'products'] } }, required: ['warehouseId'], additionalProperties: false }, execute: async ({ warehouseId, mode = 'design' }) => ({ ok: openProject(warehouseId, mode), warehouseId, mode }) },
    { name: 'slotlab_duplicate_warehouse', description: 'Create an independent copy of a warehouse so alternatives can be explored without changing the source.', inputSchema: { type: 'object', properties: { warehouseId: { type: 'string' } }, required: ['warehouseId'], additionalProperties: false }, execute: async ({ warehouseId }) => { const project = duplicateWarehouse(warehouseId); refreshOpenHub(); return project ? { ok: true, warehouse: warehouseSummary(project) } : { ok: false, error: 'UNKNOWN_WAREHOUSE' }; } },
    { name: 'slotlab_archive_warehouse', description: 'Archive or restore a warehouse project. Permanent deletion remains a human-only confirmed action.', inputSchema: { type: 'object', properties: { warehouseId: { type: 'string' }, archived: { type: 'boolean' } }, required: ['warehouseId', 'archived'], additionalProperties: false }, execute: async ({ warehouseId, archived }) => { const project = updateWarehouse(warehouseId, { archived }); refreshOpenHub(); return project ? { ok: true, warehouseId, archived } : { ok: false, error: 'UNKNOWN_WAREHOUSE' }; } },
    { name: 'slotlab_export_warehouse', description: 'Export a portable, versioned JSON representation of one warehouse project.', inputSchema: { type: 'object', properties: { warehouseId: { type: 'string' } }, required: ['warehouseId'], additionalProperties: false }, execute: async ({ warehouseId }) => exportWarehouse(warehouseId) || { ok: false, error: 'UNKNOWN_WAREHOUSE' } }
  ];
  for (const definition of tools) { const tool = prepareWebMCPTool(definition); const catalog = globalThis.slotlabToolCatalog ||= []; if (!catalog.some(item => item.name === tool.name)) catalog.push({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema, annotations: tool.annotations, group: 'Projects' }); const execute = tool.execute; tool.execute = async input => { const tracer = globalThis.slotlabTraceToolCall; return tracer ? tracer(tool, input, execute, 'Projects') : execute(validateWebMCPInput(tool.inputSchema, input ?? {})); }; try { mc.registerTool(tool); } catch (error) { console.warn('Project tool registration failed', tool.name, error); } }
  globalThis.slotlabToolCount = (globalThis.slotlabToolCount || 0) + tools.length;
  return tools.length;
}

export function initProjectHub() {
  ensureMigrated();
  document.querySelector('.app').insertAdjacentHTML('beforeend', `<main class="project-home" id="project-home">
    <section class="hub-hero"><div><div class="eyebrow">Project library</div><h2>My warehouses</h2><p>Create, organize, and compare warehouse designs with verifiable capacity and geometry.</p></div><div class="header-actions"><button class="button ghost" id="import-project">Import JSON</button><button class="button primary new-project" id="new-project">＋ Create warehouse</button><input id="import-project-file" type="file" accept="application/json,.json" hidden></div></section>
    <section class="hub-toolbar"><div class="hub-tabs"><button id="show-active" class="active">Active <b id="active-count">0</b></button><button id="show-archived">Archived <b id="archived-count">0</b></button></div><div class="hub-hint"><i></i> Automatic local saving</div></section>
    <section class="warehouse-grid" id="warehouse-grid"></section>
  </main>`);
  document.body.insertAdjacentHTML('beforeend', `<dialog id="project-dialog" class="project-dialog" data-source="blank" data-template="picking"><form method="dialog"><button class="dialog-close" value="cancel" aria-label="Close">×</button><div class="eyebrow">New project</div><h2>Create warehouse</h2><p>Start with an empty space or an editable layout template. Templates define geometry only; sample products are loaded separately in Products.</p><label>Warehouse name<input id="project-name" name="name" required placeholder="E.g. Lima North Distribution Center"></label><div class="source-options"><button type="button" class="source-option active" data-source="blank"><span class="source-title"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M8 8h8M8 12h8M8 16h5"></path></svg><b>Create blank</b></span><small>12 × 8 m empty space without racks or products</small></button><button type="button" class="source-option" data-source="template"><span class="source-title"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M8 3v18M16 3v18M3 9h18M3 15h18"></path></svg><b>Use template</b></span><small>Choose a predefined, fully editable warehouse layout</small></button></div><section class="template-picker" id="template-picker" hidden><div class="template-picker-head"><strong>Select a layout template</strong><small>Geometry only · no sample products</small></div><div class="template-grid"><button type="button" class="template-option active" data-template="picking"><i class="template-icon manual"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V5h16v15M4 10h16M4 15h16M9 5v15M15 5v15"></path></svg></i><span><b>Manual picking</b><small>12 × 8 m · 4 racks · 60 locations</small></span></button><button type="button" class="template-option" data-template="pallet"><i class="template-icon pallet"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18h18M5 18v3M19 18v3M6 14h12v4M7 10h4v4M13 10h4v4"></path></svg></i><span><b>Pallet racks</b><small>26 × 16 m · 6 racks · 192 locations</small></span></button><button type="button" class="template-option" data-template="cold"><i class="template-icon cold"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v20M4.5 6.3l15 11.4M4.5 17.7l15-11.4M8.5 4.7 12 7l3.5-2.3M8.5 19.3 12 17l3.5 2.3"></path></svg></i><span><b>Cold storage facility</b><small>36 × 18 m · 9 racks · 216 locations</small></span></button></div></section><div class="dialog-actions"><button class="button ghost" value="cancel">Cancel</button><button class="button primary" id="create-project" value="default">Create warehouse</button></div></form></dialog>`);
  document.body.insertAdjacentHTML('beforeend', `<dialog id="app-dialog" class="project-dialog app-dialog"><form method="dialog"><button class="dialog-close" value="cancel" aria-label="Close">×</button><div class="eyebrow">Spacio</div><h2 id="app-dialog-title">Confirm action</h2><p id="app-dialog-message"></p><label id="app-dialog-input-wrap" hidden><span id="app-dialog-input-label">Name</span><input id="app-dialog-input" autocomplete="off"></label><div class="dialog-actions"><button class="button ghost" id="app-dialog-cancel" value="cancel">Cancel</button><button class="button primary" id="app-dialog-confirm" value="confirm">Continue</button></div></form></dialog>`);

  const currentRoute = route();
  if (currentRoute.page === 'warehouse' && activateWarehouse(currentRoute.id)) {
    document.body.classList.remove('project-home-mode');
    const project = getWarehouse(currentRoute.id);
    $('brand-title').textContent = project.name; $('brand-subtitle').textContent = 'Spacio · spatial design and slotting';
  } else {
    if (location.hash) history.replaceState(null, '', `${location.pathname}${location.search}`);
    document.body.classList.add('project-home-mode');
    renderHub(false);
  }

  $('go-home').addEventListener('click', () => {
    persistActiveDraft();
    history.replaceState(null, '', `${location.pathname}${location.search}`);
    location.reload();
  });
  $('new-project').addEventListener('click', showCreateDialog);
  $('import-project').addEventListener('click', () => $('import-project-file').click());
  $('import-project-file').addEventListener('change', async event => { const file = event.target.files?.[0]; if (!file) return; try { const project = importWarehouse(JSON.parse(await file.text())); renderHub(false); await showAppDialog({ title: 'Import complete', message: `“${project.name}” was imported as an independent project.`, confirmLabel: 'Done', cancelLabel: '' }); } catch { await showAppDialog({ title: 'Import failed', message: 'The file is not a valid Spacio export.', confirmLabel: 'Close', cancelLabel: '' }); } finally { event.target.value = ''; } });
  $('project-dialog').querySelectorAll('.source-option').forEach(option => option.addEventListener('click', () => {
    $('project-dialog').dataset.source = option.dataset.source;
    $('project-dialog').querySelectorAll('.source-option').forEach(item => item.classList.toggle('active', item === option));
    $('template-picker').hidden = option.dataset.source !== 'template';
  }));
  $('project-dialog').querySelectorAll('.template-option').forEach(option => option.addEventListener('click', () => {
    $('project-dialog').dataset.template = option.dataset.template;
    $('project-dialog').querySelectorAll('.template-option').forEach(item => item.classList.toggle('active', item === option));
  }));
  $('show-active').addEventListener('click', () => renderHub(false)); $('show-archived').addEventListener('click', () => renderHub(true));
  $('project-dialog').addEventListener('close', () => {
    if ($('project-dialog').returnValue !== 'default') return;
    const source = $('project-dialog').dataset.source;
    const template = source === 'template' ? $('project-dialog').dataset.template : 'blank';
    const labels = { picking: 'manual picking', pallet: 'pallet racks', cold: 'cold storage facility' };
    const project = createWarehouse({ name: $('project-name').value, template, description: template === 'blank' ? 'Empty project ready for design.' : `Project created from the ${labels[template]}.` });
    openProject(project.id, 'design');
  });
  $('warehouse-grid').addEventListener('click', async event => {
    const action = event.target.closest('[data-action]')?.dataset.action; if (!action) return;
    const card = event.target.closest('.warehouse-card'); const id = card?.dataset.id; const project = getWarehouse(id); if (!project) return;
    if (action === 'open') openProject(id, 'design');
    if (action === 'menu') { const menu = card.querySelector('.card-menu'); menu.hidden = !menu.hidden; }
    if (action === 'duplicate') { duplicateWarehouse(id); renderHub(project.archived); }
    if (action === 'archive') { updateWarehouse(id, { archived: !project.archived }); renderHub(project.archived); }
    if (action === 'rename') { const result = await showAppDialog({ title: 'Rename warehouse', message: 'Choose a clear name for this project.', confirmLabel: 'Save name', inputLabel: 'Warehouse name', inputValue: project.name }); if (result.confirmed && result.value) { updateWarehouse(id, { name: result.value }); renderHub(project.archived); } }
    if (action === 'export') downloadProject(project);
    if (action === 'delete') { const result = await showAppDialog({ title: 'Delete warehouse?', message: `“${project.name}” and its saved layouts will be permanently deleted. This action cannot be undone.`, confirmLabel: 'Delete warehouse', danger: true }); if (result.confirmed) { deleteWarehouse(id); renderHub(project.archived); } }
  });
  globalThis.addEventListener('message', event => { if (event.origin === location.origin && event.data?.type === 'slotlab:facility-updated') persistActiveDraft(); });
  globalThis.addEventListener('beforeunload', persistActiveDraft);
  registerProjectTools();
  return { route: route(), activeProject: activeWarehouse(), openProject, persistActiveDraft };
}

export function projectHash(mode) {
  const project = activeWarehouse();
  return project ? `#warehouse/${project.id}/${mode}` : '';
}

export function persistActiveInventory(inventory) {
  const project = activeWarehouse();
  return project ? updateWarehouseInventory(project.id, inventory) : null;
}

export { persistActiveDraft };
