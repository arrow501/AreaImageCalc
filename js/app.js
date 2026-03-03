import { S } from './state.js';
import { resize, startRenderLoop } from './render.js';
import { enableTools, restoreState, doSave } from './tools.js';
import './input.js';

resize();
enableTools(false);
restoreState();
startRenderLoop();

window.addEventListener('beforeunload', function() {
  if (S.pendingSave) doSave();
});
