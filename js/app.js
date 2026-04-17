import { S } from './state.js';
import { resize, startRenderLoop } from './render.js';
import { enableTools } from './ui.js';
import { scheduleSave, doSave, restoreState } from './storage.js';
import { createTab, switchToTab } from './tabs.js';
import './input.js';
import './storageUI.js';

resize();
enableTools(false);

if (!restoreState()) {
  createTab('Untitled', null, null);
  switchToTab(0);
}

startRenderLoop();

window.addEventListener('beforeunload', function() {
  if (S.pendingSave) doSave();
});

// Mobile browsers may kill the page on backgrounding without firing beforeunload.
document.addEventListener('visibilitychange', function() {
  if (document.visibilityState === 'hidden' && S.pendingSave) doSave();
});
