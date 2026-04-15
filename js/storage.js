import { S, SAVE_KEY, SAVE_VER, SAVE_VER_LEGACY, STORAGE_SOFT_LIMIT, STORAGE_HARD_LIMIT } from './state.js';
import { serializeTab, snapshotCurrentTab, createTab, switchToTab } from './tabs.js';

export function scheduleSave() {
  if (S.saveTimer) clearTimeout(S.saveTimer);
  S.pendingSave = true;
  S.saveTimer = setTimeout(doSave, 2000);
}

function buildState(dropNonActive, dropAll) {
  return JSON.stringify({
    v: SAVE_VER,
    ts: Date.now(),
    currentTabIdx: S.currentTabIdx,
    tabs: S.tabs.map(function(tab, i) {
      const s = serializeTab(tab);
      if (dropAll || (dropNonActive && i !== S.currentTabIdx)) s.imgDataUrl = null;
      return s;
    })
  });
}

export function doSave() {
  S.pendingSave = false;
  snapshotCurrentTab();

  const hasAny = S.tabs.some(function(t) { return t.imgDataUrl || t.imgWebpUrl; });
  if (!hasAny && !S.imgDataUrl) return;

  let json = buildState(false, false);
  let bytes = new Blob([json]).size;

  if (bytes > STORAGE_SOFT_LIMIT) {
    json = buildState(true, false);
    bytes = new Blob([json]).size;
  }

  if (bytes > STORAGE_HARD_LIMIT) {
    json = buildState(false, true);
    bytes = new Blob([json]).size;
  }

  if (bytes > STORAGE_HARD_LIMIT) {
    // Cannot save — shapes-only state still exceeds the hard limit (extremely unlikely)
    $(document).trigger('storage:update', [STORAGE_HARD_LIMIT]);
    return;
  }

  try {
    localStorage.setItem(SAVE_KEY, json);
    $(document).trigger('storage:update', [bytes]);
  } catch (e) {
    console.warn('Auto-save failed:', e);
    $(document).trigger('storage:update', [STORAGE_HARD_LIMIT]);
  }
}

export function restoreState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;

    const state = JSON.parse(raw);
    if (!state) return false;

    // Legacy v2 single-tab format
    if (state.v === SAVE_VER_LEGACY && state.img) {
      const idx = createTab('Restored', state.img, null);
      const tab = S.tabs[idx];
      if (state.iw) tab.view.iw = state.iw;
      if (state.ih) tab.view.ih = state.ih;
      tab.shapes = state.shapes || [];
      tab.colorIdx = state.colorIdx || 0;
      tab.shapeN = state.shapeN || 0;
      tab.scalePPU = state.scalePPU || 0;
      tab.scaleUnit = state.scaleUnit || 'cm';
      tab.scaleLine = state.scaleLine || null;
      switchToTab(idx);
      return true;
    }

    // v3 multi-tab format
    if (state.v !== SAVE_VER || !state.tabs || !state.tabs.length) return false;

    for (let i = 0; i < state.tabs.length; i++) {
      const td = state.tabs[i];
      const tidx = createTab(td.label || 'Tab ' + (i + 1), td.imgDataUrl || null, null);
      const t = S.tabs[tidx];
      if (td.view) t.view = td.view;
      t.shapes = td.shapes || [];
      t.colorIdx = td.colorIdx || 0;
      t.shapeN = td.shapeN || 0;
      t.scalePPU = td.scalePPU || 0;
      t.scaleUnit = td.scaleUnit || 'cm';
      t.scaleLine = td.scaleLine || null;
      t.brightness = td.brightness || 0;
      t.contrast = td.contrast || 0;
    }

    const targetIdx = (state.currentTabIdx >= 0 && state.currentTabIdx < S.tabs.length) ? state.currentTabIdx : 0;
    switchToTab(targetIdx);
    return true;
  } catch (e) {
    console.warn('Restore failed:', e);
    localStorage.removeItem(SAVE_KEY);
    return false;
  }
}
