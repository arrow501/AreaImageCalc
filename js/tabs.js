import { S, fn } from './state.js';

export function makeTabData() {
  return {
    label: 'Untitled',
    tabId: 0,         // stable ID assigned at createTab time
    imgDataUrl: null,
    imgWebpUrl: null, // set after background WebP encode completes
    webpPending: false,
    img: null,
    view: { ox: 0, oy: 0, zoom: 1, fit: 1, iw: 0, ih: 0 },
    shapes: [],
    colorIdx: 0,
    shapeN: 0,
    scalePPU: 0,
    scaleUnit: 'cm',
    scaleLine: null,
    brightness: 0,
    contrast: 0,
    pdfSource: null
  };
}

export function snapshotCurrentTab() {
  if (S.currentTabIdx < 0 || !S.tabs[S.currentTabIdx]) return;
  var tab = S.tabs[S.currentTabIdx];
  tab.imgDataUrl = S.imgDataUrl;
  tab.img = S.img;
  tab.view = { ox: S.view.ox, oy: S.view.oy, zoom: S.view.zoom, fit: S.view.fit, iw: S.view.iw, ih: S.view.ih };
  tab.shapes = S.shapes;
  tab.colorIdx = S.colorIdx;
  tab.shapeN = S.shapeN;
  tab.scalePPU = S.scalePPU;
  tab.scaleUnit = S.scaleUnit;
  tab.scaleLine = S.scaleLine;
  tab.brightness = S.brightness;
  tab.contrast = S.contrast;
}

export function applyTabToState(idx) {
  var tab = S.tabs[idx];
  if (!tab) return;

  if (S.perspActive && fn.cancelPerspective) fn.cancelPerspective();
  if (S.tool === 'squarecal' && fn.cancelSqCalib) fn.cancelSqCalib();

  S.imgDataUrl = tab.imgDataUrl;
  S.img = tab.img;
  S.view.ox = tab.view.ox;
  S.view.oy = tab.view.oy;
  S.view.zoom = tab.view.zoom;
  S.view.fit = tab.view.fit;
  S.view.iw = tab.view.iw;
  S.view.ih = tab.view.ih;
  S.shapes = tab.shapes;
  S.colorIdx = tab.colorIdx;
  S.shapeN = tab.shapeN;
  S.scalePPU = tab.scalePPU;
  S.scaleUnit = tab.scaleUnit;
  S.scaleLine = tab.scaleLine;
  S.brightness = tab.brightness;
  S.contrast = tab.contrast;

  S.perspActive = false;
  S.perspCorners = null;
  S.perspSrcCorners = null;
  S.perspDragIdx = -1;
  S.perspDragOffset = null;

  S.tool = 'idle';
  S.selId = null;
  S.polyPts = [];
  S.fhPts = [];
  S.isFH = false;
  S.scaleState = 0;
  S.scaleP1 = null;
  S.scaleP2 = null;
  S.dragPt = null;
  S.dragShape = null;
  S.dragIdx = -1;
  S.isPan = false;
  S.panSt = null;
  S.spaceHeld = false;
  S.touchId = null;
  S.touchIsPan = false;
  S.FH_MIN_DIST = (S.view.iw && S.view.ih) ? Math.max(1, Math.log2(S.view.iw + S.view.ih) - 8.5) : 0;

  S.imageDirty = S.overlayDirty = true;
}

export function createTab(label, imgDataUrl, imgElement) {
  var tab = makeTabData();
  tab.tabId = S.tabN++;
  tab.label = label || 'Untitled';
  tab.imgDataUrl = imgDataUrl || null;
  tab.img = imgElement || null;
  if (imgElement) {
    tab.view.iw = imgElement.naturalWidth;
    tab.view.ih = imgElement.naturalHeight;
  }
  S.tabs.push(tab);
  return S.tabs.length - 1;
}

export function switchToTab(idx) {
  if (idx < 0 || idx >= S.tabs.length) return;

  snapshotCurrentTab();
  applyTabToState(idx);
  S.currentTabIdx = idx;

  var tab = S.tabs[idx];

  // Reset toolbar tool visuals without triggering status flicker on every switch
  if (fn.setTool) fn.setTool('idle');

  if (tab.img) {
    if (fn.fitView) fn.fitView();
    if (fn.enableTools) fn.enableTools(true);
    if (fn.updateFilters) fn.updateFilters();
    if (fn.syncSliders) fn.syncSliders();
    $('#dropzone').css('pointer-events', 'none').find('.dz-content').hide();
  } else if (tab.pdfSource) {
    if (fn.renderPdfTabPage) fn.renderPdfTabPage(idx);
  } else if (tab.imgDataUrl) {
    // Parked tab — reload the image element on demand
    var ni = new Image();
    var capturedIdx = idx;
    ni.onload = function() {
      S.tabs[capturedIdx].img = ni;
      S.tabs[capturedIdx].view.iw = ni.naturalWidth;
      S.tabs[capturedIdx].view.ih = ni.naturalHeight;
      if (S.currentTabIdx !== capturedIdx) return;
      S.img = ni;
      S.view.iw = ni.naturalWidth;
      S.view.ih = ni.naturalHeight;
      S.FH_MIN_DIST = Math.max(1, Math.log2(S.view.iw + S.view.ih) - 8.5);
      if (fn.fitView) fn.fitView();
      if (fn.updateFilters) fn.updateFilters();
      if (fn.syncSliders) fn.syncSliders();
      if (fn.enableTools) fn.enableTools(true);
      if (fn.updatePanel) fn.updatePanel();
      if (fn.updateScaleDisp) fn.updateScaleDisp();
      $('#dropzone').css('pointer-events', 'none').find('.dz-content').hide();
    };
    ni.src = tab.imgDataUrl;
  } else {
    if (fn.enableTools) fn.enableTools(false);
    if (fn.updateFilters) fn.updateFilters();
    if (fn.syncSliders) fn.syncSliders();
    $('#dropzone').css('pointer-events', 'auto').find('.dz-content').show();
  }

  renderTabBar();
  if (fn.updatePanel) fn.updatePanel();
  if (fn.updateScaleDisp) fn.updateScaleDisp();  // single call covers all branches
  if (fn.updateZoomDisp) fn.updateZoomDisp();
}

export function closeTab(idx) {
  if (S.tabs.length <= 1) {
    var fresh = makeTabData();
    Object.assign(S.tabs[0], fresh);
    S.currentTabIdx = -1;
    applyTabToState(0);
    S.currentTabIdx = 0;
    if (fn.setTool) fn.setTool('idle');
    if (fn.enableTools) fn.enableTools(false);
    if (fn.updateFilters) fn.updateFilters();
    if (fn.syncSliders) fn.syncSliders();
    if (fn.updatePanel) fn.updatePanel();
    if (fn.updateScaleDisp) fn.updateScaleDisp();
    if (fn.status) fn.status('Drop an image, click Open, or paste to start');
    $('#dropzone').css('pointer-events', 'auto').find('.dz-content').show();
    renderTabBar();
    return;
  }

  if (idx === S.currentTabIdx) snapshotCurrentTab();
  S.tabs.splice(idx, 1);

  var newIdx = S.currentTabIdx;
  if (idx < newIdx) newIdx--;
  else if (idx === newIdx) newIdx = Math.max(0, newIdx - 1);
  if (newIdx >= S.tabs.length) newIdx = S.tabs.length - 1;

  S.currentTabIdx = -1;
  switchToTab(newIdx);
}

export function renderTabBar() {
  var $bar = $('#tab-bar');
  if (!$bar.length) return;
  $bar.empty();

  for (var i = 0; i < S.tabs.length; i++) {
    var tab = S.tabs[i];
    var isActive = i === S.currentTabIdx;
    var label = tab.label || 'Untitled';
    var displayLabel = label.length > 18 ? label.substring(0, 16) + '\u2026' : label;

    $bar.append(
      '<div class="tab-item' + (isActive ? ' active' : '') + '" data-idx="' + i + '">' +
        '<span class="tab-label">' + _escHtml(displayLabel) + '</span>' +
        '<button class="tab-close" data-idx="' + i + '">\u00d7</button>' +
      '</div>'
    );
  }

  $bar.append('<button id="btn-new-tab" title="New tab">+</button>');
}

function _escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Serialise a tab snapshot to a plain JSON-safe object.
// Used by both auto-save (storage.js) and explicit project export (export.js).
// Always uses the WebP version if available — falls back to original.
export function serializeTab(tab) {
  return {
    label: tab.label,
    imgDataUrl: tab.imgWebpUrl || tab.imgDataUrl,
    view: { ox: tab.view.ox, oy: tab.view.oy, zoom: tab.view.zoom, fit: tab.view.fit, iw: tab.view.iw, ih: tab.view.ih },
    shapes: tab.shapes.map(function(s) {
      return { id: s.id, type: s.type, points: s.points, closed: s.closed, color: s.color, area: s.area, perimeter: s.perimeter };
    }),
    colorIdx: tab.colorIdx,
    shapeN: tab.shapeN,
    scalePPU: tab.scalePPU,
    scaleUnit: tab.scaleUnit,
    scaleLine: tab.scaleLine,
    brightness: tab.brightness || 0,
    contrast: tab.contrast || 0
  };
}
