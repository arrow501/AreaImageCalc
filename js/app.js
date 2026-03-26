import { S, fn } from './state.js';
import { resize, startRenderLoop } from './render.js';
import { enableTools, restoreState, doSave } from './tools.js';
import { createTab, switchToTab, closeTab, renderTabBar, snapshotCurrentTab } from './tabs.js';
import { loadPdf, renderPdfTabPage } from './pdf.js';
import { exportProject, importProject, exportMeasurements } from './export.js';
import './input.js';

// Register tab lifecycle functions on fn before restoreState is called
fn.createTab = createTab;
fn.switchToTab = switchToTab;
fn.closeTab = closeTab;
fn.renderTabBar = renderTabBar;
fn.snapshotCurrentTab = snapshotCurrentTab;

// Register PDF and export functions
fn.loadPdf = loadPdf;
fn.renderPdfTabPage = renderPdfTabPage;
fn.exportProject = exportProject;
fn.importProject = importProject;
fn.exportMeasurements = exportMeasurements;

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
