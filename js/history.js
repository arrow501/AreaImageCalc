// Per-tab undo/redo for measurement state (shapes, scale). Snapshots are
// taken before each mutation via recordHistory(). Image-altering operations
// (rotate, perspective) clear history instead — undoing geometry across an
// image transform would desync shapes from pixels.

import { S } from './state.js';
import { updatePanel, updateScaleDisp, status } from './ui.js';
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
  S.colorIdx = snap.colorIdx;
  S.shapeN = snap.shapeN;
  if (tab) {
    tab.shapes = S.shapes;
    tab.scalePPU = S.scalePPU;
    tab.scaleUnit = S.scaleUnit;
    tab.scaleLine = S.scaleLine;
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

export function undo() {
  const tab = stacks();
  if (!tab || !tab.undoStack.length) { status('Nothing to undo'); return; }
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
