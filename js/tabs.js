import { S } from './state.js';
import { setTool, enableTools, updateFilters, syncSliders, updatePanel, updateScaleDisp, updateZoomDisp, status, fitView } from './ui.js';
import { EVT, emit } from './events.js';

export function getActiveTab() {
  return S.currentTabIdx >= 0 ? S.tabs[S.currentTabIdx] : null;
}

export function newCurrentTab() {
  if (S.currentTabIdx < 0) return;
  const idx = S.currentTabIdx;
  const fresh = makeTabData();
  fresh.tabId = S.tabs[idx].tabId;   // keep stable ID so sidebar position is preserved
  Object.assign(S.tabs[idx], fresh);
  S.currentTabIdx = -1;
  applyTabToState(idx);
  S.currentTabIdx = idx;
  setTool('idle');
  enableTools(false);
  updateFilters();
  syncSliders();
  updatePanel();
  updateScaleDisp();
  status('Drop an image, click Open, or paste to start');
  $('#dropzone').css('pointer-events', 'auto').find('.dz-content').show();
  renderSidebar();
}

export function makeTabData() {
  return {
    label: 'Untitled',
    tabId: 0,         // stable ID assigned at createTab time
    docId: null,      // shared by pages of one multi-page document
    docLabel: null,   // document display name for grouped pages
    pageNum: 0,       // page number within the document
    imgDataUrl: null,
    imgWebpUrl: null, // set after background WebP encode completes
    webpPending: false,
    img: null,
    baseImg: null,    // pre-rotation original; rotations recompose from this
    baseRotation: 0,  // cumulative rotation applied to baseImg, degrees
    view: { ox: 0, oy: 0, zoom: 1, fit: 1, iw: 0, ih: 0 },
    shapes: [],
    colorIdx: 0,
    shapeN: 0,
    scalePPU: 0,
    scaleUnit: 'cm',
    scaleLine: null,
    brightness: 0,
    contrast: 0,
    pdfSource: null,
    undoStack: [],
    redoStack: []
  };
}

export function snapshotCurrentTab() {
  const tab = getActiveTab();
  if (!tab) return;
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
  const tab = S.tabs[idx];
  if (!tab) return;

  // Notify perspective.js and squareCalib.js to cancel their active tools
  emit(EVT.TAB_SWITCH);

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
  S.dragScaleIdx = -1;
  S.dragScaleReal = 0;

  S.imageDirty = S.overlayDirty = true;
}

export function createTab(label, imgDataUrl, imgElement, docInfo) {
  const tab = makeTabData();
  tab.tabId = S.tabN++;
  tab.label = label || 'Untitled';
  tab.imgDataUrl = imgDataUrl || null;
  tab.img = imgElement || null;
  tab.baseImg = imgElement || null;
  if (docInfo) {
    tab.docId = docInfo.docId != null ? docInfo.docId : null;
    tab.docLabel = docInfo.docLabel || null;
    tab.pageNum = docInfo.pageNum || 0;
  }
  if (imgElement) {
    tab.view.iw = imgElement.naturalWidth;
    tab.view.ih = imgElement.naturalHeight;
  }
  S.tabs.push(tab);
  const newIdx = S.tabs.length - 1;
  if (newIdx === 1 && $('#sidebar').hasClass('collapsed')) {
    // Second document opened — reveal the sidebar automatically
    $('#sidebar').removeClass('collapsed');
    $('#btn-toggle-docs').addClass('active');
    emit(EVT.LAYOUT_CHANGE);
  }
  return newIdx;
}

export function switchToTab(idx) {
  if (idx < 0 || idx >= S.tabs.length) return;

  snapshotCurrentTab();
  applyTabToState(idx);
  S.currentTabIdx = idx;

  const tab = S.tabs[idx];

  // Reset toolbar tool visuals without triggering status flicker on every switch
  setTool('idle');

  if (tab.img) {
    fitView();
    enableTools(true);
    updateFilters();
    syncSliders();
    $('#dropzone').css('pointer-events', 'none').find('.dz-content').hide();
  } else if (tab.pdfSource) {
    emit(EVT.TAB_RENDER_PDF, [idx]);
  } else if (tab.imgDataUrl) {
    // Parked tab — reload the image element on demand
    const ni = new Image();
    const capturedIdx = idx;
    ni.onload = function() {
      S.tabs[capturedIdx].img = ni;
      S.tabs[capturedIdx].baseImg = ni;
      S.tabs[capturedIdx].baseRotation = 0;
      S.tabs[capturedIdx].view.iw = ni.naturalWidth;
      S.tabs[capturedIdx].view.ih = ni.naturalHeight;
      if (S.currentTabIdx !== capturedIdx) return;
      S.img = ni;
      S.view.iw = ni.naturalWidth;
      S.view.ih = ni.naturalHeight;
      fitView();
      updateFilters();
      syncSliders();
      enableTools(true);
      updatePanel();
      updateScaleDisp();
      $('#dropzone').css('pointer-events', 'none').find('.dz-content').hide();
    };
    ni.src = tab.imgDataUrl;
  } else {
    enableTools(false);
    updateFilters();
    syncSliders();
    $('#dropzone').css('pointer-events', 'auto').find('.dz-content').show();
  }

  renderSidebar();
  updatePanel();
  updateScaleDisp();
  updateZoomDisp();
}

function resetToSingleBlankTab() {
  const fresh = makeTabData();
  fresh.tabId = S.tabs.length ? S.tabs[0].tabId : S.tabN++;
  S.tabs.length = 0;
  S.tabs.push(fresh);
  S.currentTabIdx = -1;
  applyTabToState(0);
  S.currentTabIdx = 0;
  setTool('idle');
  enableTools(false);
  updateFilters();
  syncSliders();
  updatePanel();
  updateScaleDisp();
  status('Drop an image, click Open, or paste to start');
  $('#dropzone').css('pointer-events', 'auto').find('.dz-content').show();
  renderSidebar();
}

export function closeTab(idx) {
  if (S.tabs.length <= 1) {
    resetToSingleBlankTab();
    return;
  }

  if (idx === S.currentTabIdx) snapshotCurrentTab();
  S.tabs.splice(idx, 1);

  let newIdx = S.currentTabIdx;
  if (idx < newIdx) newIdx--;
  else if (idx === newIdx) newIdx = Math.max(0, newIdx - 1);
  if (newIdx >= S.tabs.length) newIdx = S.tabs.length - 1;

  S.currentTabIdx = -1;
  switchToTab(newIdx);
}

// Close every page of a multi-page document at once.
export function closeDoc(docId) {
  if (docId == null) return;
  snapshotCurrentTab();
  const cur = getActiveTab();
  const remaining = S.tabs.filter(function(t) { return t.docId !== docId; });

  if (!remaining.length) {
    resetToSingleBlankTab();
    return;
  }

  S.tabs.length = 0;
  Array.prototype.push.apply(S.tabs, remaining);

  let newIdx = cur ? S.tabs.indexOf(cur) : -1;
  if (newIdx < 0) newIdx = Math.min(Math.max(S.currentTabIdx, 0), S.tabs.length - 1);
  S.currentTabIdx = -1;
  switchToTab(newIdx);
}

// ---- Document grouping ----

export function buildDocGroups() {
  const groups = [];
  const byDoc = {};
  for (let i = 0; i < S.tabs.length; i++) {
    const tab = S.tabs[i];
    if (tab.docId != null) {
      let g = byDoc[tab.docId];
      if (!g) {
        g = { docId: tab.docId, label: tab.docLabel || tab.label, pages: [] };
        byDoc[tab.docId] = g;
        groups.push(g);
      }
      g.pages.push({ idx: i, tab: tab });
    } else {
      groups.push({ docId: null, label: tab.label, pages: [{ idx: i, tab: tab }] });
    }
  }
  return groups;
}

// Siblings for page navigation: pages of the current document, or the flat
// tab list when the current tab is standalone.
export function navPage(delta) {
  const cur = getActiveTab();
  if (!cur) return;

  let order;
  if (cur.docId != null) {
    order = [];
    for (let i = 0; i < S.tabs.length; i++) {
      if (S.tabs[i].docId === cur.docId) order.push(i);
    }
  } else {
    order = S.tabs.map(function(_, i) { return i; });
  }

  const pos = order.indexOf(S.currentTabIdx);
  const target = order[pos + delta];
  if (target !== undefined && target !== S.currentTabIdx) switchToTab(target);
}

// ---- Sidebar rendering ----

const _collapsedDocs = {};

export function renderSidebar() {
  const $list = $('#doc-list');
  if (!$list.length) return;
  $list.empty();

  const groups = buildDocGroups();

  for (let g = 0; g < groups.length; g++) {
    const grp = groups[g];
    const multi = grp.pages.length > 1;
    const isDocActive = grp.pages.some(function(p) { return p.idx === S.currentTabIdx; });
    const collapsed = multi && _collapsedDocs[grp.docId];

    const $item = $('<div class="doc-item">').toggleClass('active', isDocActive);
    const $row = $('<div class="doc-row">');

    if (multi) {
      $row.append(
        $('<span class="doc-caret">').html(collapsed ? '&#9656;' : '&#9662;')
          .attr('data-doc', grp.docId)
      );
    } else {
      $row.append($('<span class="doc-caret doc-caret-empty">'));
    }

    $row.append($('<span class="doc-label">').text(grp.label).attr('title', grp.label));
    if (multi) $row.append($('<span class="doc-count">').text(grp.pages.length));
    $row.append(
      $('<button class="doc-close" title="Close">').html('&times;')
        .attr('data-doc', grp.docId == null ? '' : grp.docId)
        .attr('data-idx', multi ? '' : grp.pages[0].idx)
    );
    $row.attr('data-idx', multi
      ? (isDocActive ? S.currentTabIdx : grp.pages[0].idx)
      : grp.pages[0].idx);
    if (multi) $row.attr('data-doc-row', grp.docId);
    $item.append($row);

    if (multi && !collapsed) {
      const $pages = $('<div class="doc-pages">');
      for (let p = 0; p < grp.pages.length; p++) {
        const pg = grp.pages[p];
        const pageActive = pg.idx === S.currentTabIdx;
        $pages.append(
          $('<div class="doc-page">').toggleClass('active', pageActive)
            .attr('data-idx', pg.idx)
            .append($('<span class="doc-label">').text('Page ' + (pg.tab.pageNum || p + 1)))
            .append($('<button class="doc-close" title="Close page">').html('&times;').attr('data-idx', pg.idx))
        );
      }
      $item.append($pages);
    }

    $list.append($item);
  }

  updatePageNav();
}

export function toggleDocCollapsed(docId) {
  _collapsedDocs[docId] = !_collapsedDocs[docId];
  renderSidebar();
}

// ---- Page navigation UI (statusbar) ----

function updatePageNav() {
  const cur = getActiveTab();
  const $nav = $('#page-nav');
  if (!cur || cur.docId == null) { $nav.hide(); return; }

  const order = [];
  for (let i = 0; i < S.tabs.length; i++) {
    if (S.tabs[i].docId === cur.docId) order.push(i);
  }
  if (order.length < 2) { $nav.hide(); return; }

  const pos = order.indexOf(S.currentTabIdx);
  $('#page-nav-label').text('Page ' + (cur.pageNum || pos + 1) + ' / ' + order.length);
  $('#page-prev').toggleClass('disabled', pos <= 0);
  $('#page-next').toggleClass('disabled', pos >= order.length - 1);
  $nav.css('display', 'flex');
}

// Serialise a tab snapshot to a plain JSON-safe object.
// Used by both auto-save (storage.js) and explicit project export (export.js).
// Always uses the WebP version if available — falls back to original.
export function serializeTab(tab) {
  return {
    label: tab.label,
    docId: tab.docId,
    docLabel: tab.docLabel,
    pageNum: tab.pageNum,
    imgDataUrl: tab.imgWebpUrl || tab.imgDataUrl,
    view: { ox: tab.view.ox, oy: tab.view.oy, zoom: tab.view.zoom, fit: tab.view.fit, iw: tab.view.iw, ih: tab.view.ih },
    shapes: tab.shapes.map(function(s) {
      return { id: s.id, type: s.type, points: s.points, closed: s.closed, color: s.color, area: s.area, perimeter: s.perimeter, length: s.length, name: s.name, hidden: s.hidden, text: s.text };
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

// Copy persisted tab fields onto a freshly created tab (restore/import).
export function hydrateTabFields(tab, td) {
  if (td.view) tab.view = td.view;
  tab.docId = td.docId != null ? td.docId : null;
  tab.docLabel = td.docLabel || null;
  tab.pageNum = td.pageNum || 0;
  tab.shapes = td.shapes || [];
  tab.colorIdx = td.colorIdx || 0;
  tab.shapeN = td.shapeN || 0;
  tab.scalePPU = td.scalePPU || 0;
  tab.scaleUnit = td.scaleUnit || 'cm';
  tab.scaleLine = td.scaleLine || null;
  tab.brightness = td.brightness || 0;
  tab.contrast = td.contrast || 0;
}
