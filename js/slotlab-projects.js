const INDEX_KEY = 'slotlab:v1:warehouses';
const SETTINGS_KEY = 'slotlab:v1:settings';
const ACTIVE_DRAFT_KEY = 'slotlab-facility-draft';
const PROJECT_SCHEMA_VERSION = 2;
const projectKey = id => `slotlab:v1:warehouse:${id}`;

const parse = (value, fallback = null) => {
  try { return JSON.parse(value) ?? fallback; } catch { return fallback; }
};
const clone = value => JSON.parse(JSON.stringify(value));
const now = () => new Date().toISOString();
const uid = () => `wh_${globalThis.crypto?.randomUUID?.().slice(0, 8) || Math.random().toString(36).slice(2, 10)}`;

function starterDraft() {
  const config = { shape: 'rectangle', roomWidth: 36, roomDepth: 18, rackLength: 7.2, rackDepth: 1.6, levels: 4, bays: 6, aisle: 1.6, access: 'both', traffic: 'cart' };
  const items = [
    ['Q1', -13, -2.1, 'CHEESE'], ['Q2', -9.8, -2.1, 'CHEESE'], ['Q3', -6.6, -2.1, 'CHEESE'],
    ['Y1', -2.6, -2.1, 'YOGURT'], ['Y2', .6, -2.1, 'YOGURT'], ['Y3', 3.8, -2.1, 'YOGURT'],
    ['C1', 7.8, -2.1, 'MEAT'], ['C2', 11, -2.1, 'MEAT'], ['C3', 14.2, -2.1, 'MEAT']
  ].map(([id, x, z, category], index) => ({ id, category, accessAxis: 'x', x, z, length: 1.6, depth: 7.2, rotated: true, row: 0, col: index }));
  const zones = [
    { id: 'preparation', label: 'Preparation', type: 'shipping', x: 8, z: 7.1, width: 8, depth: 1.6 },
    { id: 'dispatch', label: 'Dispatch', type: 'dock', x: 14, z: 7.1, width: 4, depth: 1.6 }
  ];
  const layout = { id: 'starter-cold-storage', name: 'Cold storage layout', description: 'Initial model migrated to the warehouse library.', score: 86, editable: true, items, zones, walls: [], doors: [], obstacles: [], rackCount: items.length, slots: items.length * config.bays * config.levels, freeArea: 80, coverage: 20 };
  return { config, layout };
}

function blankDraft() {
  const config = { shape: 'rectangle', roomWidth: 12, roomDepth: 8, rackLength: 2.4, rackDepth: 1, levels: 3, bays: 6, aisle: 1.2, access: 'both', traffic: 'people' };
  return { config, layout: { id: 'blank-layout', name: 'Empty space', description: 'Initial canvas without racks or operational zones.', score: 0, editable: true, items: [], zones: [], walls: [], doors: [], obstacles: [], rackCount: 0, slots: 0, freeArea: 100, coverage: 0 } };
}

function pickingDraft() {
  const config = { shape: 'rectangle', roomWidth: 12, roomDepth: 8, rackLength: 5.2, rackDepth: .9, levels: 3, bays: 5, aisle: 1.5, access: 'both', traffic: 'people' };
  const items = [-3.6, -1.2, 1.2, 3.6].map((x, index) => ({ id: `P${index + 1}`, category: 'PICKING', accessAxis: 'x', x, z: 0, length: .9, depth: 5.2, rotated: true, row: 0, col: index }));
  const zones = [{ id: 'packing', label: 'Packing', type: 'shipping', x: -3, z: 3.25, width: 3.5, depth: 1 }, { id: 'dispatch', label: 'Dispatch', type: 'dock', x: 3, z: 3.25, width: 3.5, depth: 1 }];
  return { config, layout: { id: 'template-picking', name: 'Small manual-picking warehouse', description: 'Four light-duty racks with packing and dispatch areas.', score: 82, editable: true, items, zones, walls: [], doors: [], obstacles: [], rackCount: items.length, slots: items.length * config.bays * config.levels, freeArea: 78, coverage: 22 } };
}

function palletDraft() {
  const config = { shape: 'rectangle', roomWidth: 26, roomDepth: 16, rackLength: 10, rackDepth: 1.2, levels: 4, bays: 8, aisle: 2.8, access: 'both', traffic: 'forklift' };
  const items = [-10, -6, -2, 2, 6, 10].map((x, index) => ({ id: `R${index + 1}`, category: 'PALLETS', accessAxis: 'x', x, z: -1.2, length: 1.2, depth: 10, rotated: true, row: 0, col: index }));
  const zones = [{ id: 'preparation', label: 'Preparation', type: 'shipping', x: -3, z: 6.5, width: 8, depth: 2 }, { id: 'dispatch', label: 'Dispatch', type: 'dock', x: 8, z: 6.5, width: 6, depth: 2 }];
  return { config, layout: { id: 'template-pallet', name: 'Pallet racks', description: 'Six pallet racks with forklift aisles, preparation, and dispatch.', score: 84, editable: true, items, zones, walls: [], doors: [], obstacles: [], rackCount: items.length, slots: items.length * config.bays * config.levels, freeArea: 83, coverage: 17 } };
}

function templateDraft(id) {
  if (id === 'picking') return pickingDraft();
  if (id === 'pallet') return palletDraft();
  if (id === 'cold' || id === 'starter') return starterDraft();
  return blankDraft();
}

function readIndex() { return parse(localStorage.getItem(INDEX_KEY), []); }
function writeIndex(ids) { localStorage.setItem(INDEX_KEY, JSON.stringify([...new Set(ids)])); }
function readSettings() { return parse(localStorage.getItem(SETTINGS_KEY), {}); }
function writeSettings(settings) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }

export function getWarehouse(id) { return parse(localStorage.getItem(projectKey(id))); }

export function listWarehouses({ includeArchived = false } = {}) {
  return readIndex().map(getWarehouse).filter(Boolean).filter(item => includeArchived || !item.archived).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function saveWarehouse(project) {
  const saved = { ...project, updatedAt: now() };
  localStorage.setItem(projectKey(saved.id), JSON.stringify(saved));
  const ids = readIndex();
  if (!ids.includes(saved.id)) writeIndex([...ids, saved.id]);
  return saved;
}

function migrateBuiltInLabels(project) {
  const migrated = clone(project);
  const layouts = migrated.facilityDraft?.layouts
    ? Object.values(migrated.facilityDraft.layouts)
    : [migrated.facilityDraft?.layout].filter(Boolean);
  for (const layout of layouts) {
    if (layout.id === 'template-picking') {
      layout.name = 'Small manual-picking warehouse';
      layout.description = 'Four light-duty racks with packing and dispatch areas.';
    }
    if ((migrated.schemaVersion || 1) < PROJECT_SCHEMA_VERSION && layout.id === 'template-pallet') {
      const current = palletDraft().layout;
      layout.description = current.description;
      layout.zones = clone(current.zones);
    }
    if ((migrated.schemaVersion || 1) < PROJECT_SCHEMA_VERSION && layout.id === 'starter-cold-storage') {
      layout.zones = clone(starterDraft().layout.zones);
    }
    for (const zone of layout.zones || []) {
      if (zone.id === 'packing') zone.label = 'Packing';
      if (zone.id === 'dispatch') zone.label = 'Dispatch';
    }
  }
  migrated.schemaVersion = PROJECT_SCHEMA_VERSION;
  return migrated;
}

export function createWarehouse(input = {}) {
  const createdAt = now();
  const draft = input.facilityDraft || templateDraft(input.template);
  const project = {
    id: uid(), schemaVersion: PROJECT_SCHEMA_VERSION, name: input.name?.trim() || 'New warehouse', description: input.description?.trim() || '',
    status: 'Draft', archived: false, createdAt, updatedAt: createdAt, facilityDraft: clone(draft),
    inventory: input.inventory ? clone(input.inventory) : null, scenarios: clone(Array.isArray(input.scenarios) ? input.scenarios : []), intent: input.intent?.trim() || ''
  };
  return saveWarehouse(project);
}

export function ensureMigrated() {
  const existing = listWarehouses({ includeArchived: true });
  if (existing.length) return existing.map(project => {
    const migrated = migrateBuiltInLabels(project);
    return JSON.stringify(migrated) === JSON.stringify(project) ? project : saveWarehouse(migrated);
  });
  return [createWarehouse({
    name: 'Sample · Picking center',
    description: 'Controlled warehouse scenario for testing layout and slotting alternatives.',
    intent: 'Explore a small picking workflow with packing, dispatch, and deterministic product placement.',
    template: 'picking'
  })];
}

export function activateWarehouse(id) {
  const project = getWarehouse(id);
  if (!project || project.archived) return null;
  localStorage.setItem(ACTIVE_DRAFT_KEY, JSON.stringify(project.facilityDraft));
  writeSettings({ ...readSettings(), activeWarehouseId: id });
  return project;
}

export function activeWarehouse() {
  const id = readSettings().activeWarehouseId;
  return id ? getWarehouse(id) : null;
}

export function persistActiveDraft() {
  const project = activeWarehouse();
  const draft = parse(localStorage.getItem(ACTIVE_DRAFT_KEY));
  if (!project || !draft) return null;
  return saveWarehouse({ ...project, facilityDraft: clone(draft) });
}

export function updateWarehouse(id, patch = {}) {
  const project = getWarehouse(id);
  if (!project) return null;
  const allowed = ['name', 'description', 'status', 'intent', 'archived'];
  const clean = Object.fromEntries(allowed.filter(key => key in patch).map(key => [key, patch[key]]));
  return saveWarehouse({ ...project, ...clean });
}

export function updateWarehouseInventory(id, inventory) {
  const project = getWarehouse(id);
  if (!project) return null;
  return saveWarehouse({ ...project, inventory: inventory ? clone(inventory) : null });
}

export function duplicateWarehouse(id) {
  const source = getWarehouse(id);
  if (!source) return null;
  return createWarehouse({ ...source, name: `${source.name} · copy`, facilityDraft: source.facilityDraft });
}

export function deleteWarehouse(id) {
  const project = getWarehouse(id);
  if (!project) return false;
  localStorage.removeItem(projectKey(id));
  writeIndex(readIndex().filter(item => item !== id));
  const settings = readSettings();
  if (settings.activeWarehouseId === id) writeSettings({ ...settings, activeWarehouseId: null });
  return true;
}

export function exportWarehouse(id) {
  const project = getWarehouse(id);
  return project ? { format: 'slotlab-warehouse', version: 1, exportedAt: now(), project: clone(project) } : null;
}

export function importWarehouse(document) {
  if (!document || document.format !== 'slotlab-warehouse' || document.version !== 1 || !document.project?.facilityDraft?.config) throw new Error('INVALID_SLOTLAB_DOCUMENT');
  const source = document.project, draft = source.facilityDraft;
  if (!draft.layout && (!draft.layouts || !Object.keys(draft.layouts).length)) throw new Error('MISSING_FACILITY_LAYOUT');
  return createWarehouse({ name: source.name || 'Imported warehouse', description: source.description || 'Project imported from Spacio.', intent: source.intent || '', facilityDraft: draft, inventory: source.inventory || null, scenarios: source.scenarios || [] });
}

export function warehouseSummary(project) {
  const config = project.facilityDraft?.config || {};
  const layout = project.facilityDraft?.layouts?.[project.facilityDraft?.active] || project.facilityDraft?.layout || {};
  const racks = layout.items?.length || 0;
  const locations = layout.slots || racks * (config.bays || 0) * (config.levels || 0);
  return { id: project.id, name: project.name, description: project.description, status: project.status, archived: project.archived, updatedAt: project.updatedAt, dimensions: { width: config.roomWidth || 0, depth: config.roomDepth || 0 }, racks, locations, scenarios: project.scenarios?.length || 0 };
}
