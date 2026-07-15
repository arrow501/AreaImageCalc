// Per-tab undo/redo for measurement state (shapes, scale). Snapshots are
// taken before each mutation via recordHistory().
//
// Image transforms (rotate, perspective) are undoable via ONE slot persisted
// in localStorage (the pre-transform image is too large for in-memory
// history). A new transform supersedes the slot, which invalidates any
// history recorded before the previous transform — those entries assume an
// older image and are pruned. Transform undo is not redoable. The slot is
// session-scoped and best-effort: quota failure just makes that transform
// non-undoable.

import { S, TRANSFORM_UNDO_KEY, SESSION, imgWorker } from './state.js';
import { updatePanel, updateScaleDisp, status, fitView } from './ui.js';
import { scheduleSave } from './storage.js';
import { getActiveTab } from './tabs.js';

const MAX_UNDO = 50;

function stripCache(s) {
  const c = Object.assign({}, s);
  delete c._centroid;
  return c;
}

function snapshot() {
  return JSON.parse(JSON.stringify({
    shapes: S.shapes.map(stripCache),
    scalePPU: S.scalePPU,
    scaleUnit: S.scaleUnit,
    scaleLine: S.scaleLine,
    scaleRef: S.scaleRef,
    colorIdx: S.colorIdx,
    shapeN: S.shapeN
  }));
}

function apply(snap) {
  const tab = getActiveTab();
  S.shapes = snap.shapes;
  S.scalePPU = snap.scalePPU;
  S.scaleUnit = snap.scaleUnit;
  S.scaleLine = snap.scaleLine;
  S.scaleRef = snap.scaleRef || null;
  S.colorIdx = snap.colorIdx;
  S.shapeN = snap.shapeN;
  if (tab) {
    tab.shapes = S.shapes;
    tab.scalePPU = S.scalePPU;
    tab.scaleUnit = S.scaleUnit;
    tab.scaleLine = S.scaleLine;
    tab.scaleRef = S.scaleRef;
    tab.colorIdx = S.colorIdx;
    tab.shapeN = S.shapeN;
  }
  if (S.selId && !S.shapes.some(function(s) { return s.id === S.selId; })) {
    S.selId = null;
  }
  S.overlayDirty = true;
  updatePanel();
  updateScaleDisp();
  scheduleSave();
}

function stacks() {
  const tab = getActiveTab();
  if (!tab) return null;
  if (!tab.undoStack) tab.undoStack = [];
  if (!tab.redoStack) tab.redoStack = [];
  return tab;
}

// Call BEFORE mutating shapes or scale state.
export function recordHistory() {
  const tab = stacks();
  if (!tab) return;
  tab.undoStack.push(snapshot());
  if (tab.undoStack.length > MAX_UNDO) tab.undoStack.shift();
  tab.redoStack.length = 0;
}

export function recordTransformHistory() {
  const tab = stacks();
  if (!tab || !S.imgDataUrl) return;
  const slot = Object.assign({
    session: SESSION,
    tabId: tab.tabId,
    ts: Date.now(),
    imgDataUrl: S.imgDataUrl,
    iw: S.view.iw,
    ih: S.view.ih
  }, snapshot());
  try {
    localStorage.setItem(TRANSFORM_UNDO_KEY, JSON.stringify(slot));
  } catch (e) {
    return; // slot too large for the quota — this transform is not undoable
  }
  for (let i = 0; i < S.tabs.length; i++) {
    const t = S.tabs[i];
    if (!t.undoStack) continue;
    const k = t.undoStack.findIndex(function(s) { return s.transform; });
    if (k >= 0) t.undoStack = t.undoStack.slice(k + 1);
  }
  tab.undoStack.push({ transform: true });
  if (tab.undoStack.length > MAX_UNDO) tab.undoStack.shift();
  tab.redoStack.length = 0;
}

function undoTransform(tab) {
  let slot = null;
  try { slot = JSON.parse(localStorage.getItem(TRANSFORM_UNDO_KEY)); } catch (e) { slot = null; }
  if (!slot || slot.session !== SESSION || slot.tabId !== tab.tabId) {
    tab.undoStack.pop();
    status('Transform undo is no longer available');
    return;
  }
  tab.undoStack.pop();
  tab.redoStack.length = 0;

  const ni = new Image();
  ni.onload = function() {
    if (getActiveTab() !== tab) return;
    S.img = ni;
    S.imgDataUrl = slot.imgDataUrl;
    S.view.iw = slot.iw;
    S.view.ih = slot.ih;
    tab.img = ni;
    tab.imgDataUrl = slot.imgDataUrl;
    tab.baseImg = ni;
    tab.baseRotation = 0;
    tab.imgWebpUrl = null;
    tab.webpPending = true;
    if (typeof createImageBitmap === 'function') {
      createImageBitmap(ni).then(function(bitmap) {
        imgWorker.postMessage({ type: 'encodeWebP', id: tab.tabId, bitmap: bitmap }, [bitmap]);
      }).catch(function() { tab.webpPending = false; });
    } else {
      tab.webpPending = false;
    }
    apply({
      shapes: slot.shapes,
      scalePPU: slot.scalePPU,
      scaleUnit: slot.scaleUnit,
      scaleLine: slot.scaleLine,
      scaleRef: slot.scaleRef,
      colorIdx: slot.colorIdx,
      shapeN: slot.shapeN
    });
    S.imageDirty = true;
    fitView();
    localStorage.removeItem(TRANSFORM_UNDO_KEY);
    status('Transform undone');
  };
  ni.src = slot.imgDataUrl;
}

export function undo() {
  const tab = stacks();
  if (!tab || !tab.undoStack.length) { status('Nothing to undo'); return; }
  const top = tab.undoStack[tab.undoStack.length - 1];
  if (top.transform) { undoTransform(tab); return; }
  tab.redoStack.push(snapshot());
  apply(tab.undoStack.pop());
  status('Undo');
}

export function redo() {
  const tab = stacks();
  if (!tab || !tab.redoStack.length) { status('Nothing to redo'); return; }
  tab.undoStack.push(snapshot());
  apply(tab.redoStack.pop());
  status('Redo');
}

export function clearHistory(tab) {
  const t = tab || getActiveTab();
  if (!t) return;
  t.undoStack = [];
  t.redoStack = [];
}
