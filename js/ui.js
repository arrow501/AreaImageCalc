// All DOM-update functions live here.
// Imports only state.js and geometry.js — no feature modules, no cycles.

import { S, iCvs, oCvs } from './state.js';
import { fmtArea, fmtPerim, fmtLen } from './geometry.js';
import { EVT, emit } from './events.js';

// ---- Tool State ----

export function cancelTool() {
  S.polyPts = [];
  S.fhPts = [];
  S.isFH = false;
  S.scaleP1 = S.scaleP2 = null;
  S.scaleState = 0;
  S.dragPt = null;
  S.dragShape = null;
  S.dragIdx = -1;
  S.dragScaleIdx = -1;
  S.dragScaleReal = 0;
  S.moveShape = null;
  S.moveLast = null;
  S.touchId = null;
  S.touchIsPan = false;
  S.labelShapeId = null;
  S.pendingNotePt = null;
  oCvs.style.cursor = '';
  $('#scale-popup').hide();
  $('#label-popup').hide();
  // Return keyboard focus to the app — a focused (hidden) popup input would
  // swallow hotkeys until the next click
  $('#scale-value, #label-value, #sq-side-value').blur();
  S.overlayDirty = true;
}

export function setTool(t) {
  cancelTool();
  S.tool = t;

  $('.tb-btn[data-tool]').removeClass('active');
  if (t !== 'idle') {
    $('.tb-btn[data-tool="' + t + '"]').addClass('active');
  }

  $('body').removeClass('cursor-crosshair cursor-grab cursor-grabbing cursor-move');

  if (t === 'scale' || t === 'polygon' || t === 'freehand' || t === 'squarecal' || t === 'segment' || t === 'note') {
    $('body').addClass('cursor-crosshair');
  }
  if (t === 'edit' || t === 'move') {
    $('body').addClass('cursor-move');
  }

  switch (t) {
    case 'idle':
      status(S.img ? 'Select a tool or click a shape' : 'Drop an image or click Open');
      break;
    case 'scale':
      status('Click first point of known distance');
      break;
    case 'polygon':
      status('Click to place vertices. Click the first point or double-click to close. Backspace removes the last point.');
      break;
    case 'freehand':
      status('Drag to trace a region. Release to close it. ESC exits.');
      break;
    case 'segment':
      status('Click points along a path. Double-click, Enter, or right-click to finish. Backspace removes the last point.');
      break;
    case 'edit':
      status('Drag control points to adjust shapes and the scale line. ESC to exit.');
      break;
    case 'move':
      status('Drag a shape to move it. Arrow keys nudge the selected shape (Shift = 10x). ESC to exit.');
      break;
    case 'label':
      status('Click a shape to rename it, or a note to edit its text.');
      break;
    case 'note':
      status('Click to pin a note. ESC exits.');
      break;
    case 'squarecal':
      status('Click 4 corners of a known square. Drag to adjust. Enter side length and Apply.');
      break;
  }

  S.overlayDirty = true;
}

// ---- Status Bar ----

export function status(t) {
  $('#status-text').text(t);
}

// ---- Toolbar State ----

export function enableTools(on) {
  const btns = $('#btn-scale, #btn-polygon, #btn-freehand, #btn-move, #btn-edit, #btn-segment, #btn-label, #btn-note, #btn-delete, #btn-clear, #btn-fit, #btn-persp, #btn-rotate-ccw, #btn-rotate-cw, #btn-rotate-custom');
  on ? btns.removeClass('disabled') : btns.addClass('disabled');
}

// ---- View ----

export function fitView() {
  if (!S.img) return;

  S.view.fit = Math.min(S.cw / S.view.iw, S.ch / S.view.ih, 1);
  S.view.zoom = 1;

  const dw = S.view.iw * S.view.fit;
  const dh = S.view.ih * S.view.fit;
  S.view.ox = (S.cw - dw) / 2;
  S.view.oy = (S.ch - dh) / 2;

  S.imageDirty = S.overlayDirty = true;
  updateZoomDisp();
  if (S.perspActive) emit(EVT.VIEW_CHANGE);
}

export function updateZoomDisp() {
  $('#zoom-display').text(Math.round(S.view.zoom * 100) + '%');
}

// ---- Scale / Measurements Display ----

export function updateScaleDisp() {
  if (S.scalePPU > 0) {
    $('#scale-display').text('1px=' + (1 / S.scalePPU).toFixed(3) + S.scaleUnit);
  } else {
    $('#scale-display').text('No scale');
  }
}

// Selection-only refresh: toggles classes in place instead of rebuilding
// rows, so double-clicks (inline rename) and hover states survive.
export function updatePanelSelection() {
  $('#shapes-list .shape-item').each(function() {
    $(this).toggleClass('selected', $(this).attr('data-id') === S.selId);
  });
}

const _collapsedGroups = {};

export function toggleGroupCollapsed(name) {
  _collapsedGroups[name] = !_collapsedGroups[name];
  updatePanel();
}

function shapeMeasureText(s) {
  if (s.type === 'segment') {
    return { m: s.length != null ? fmtLen(s.length) : '...', p: '' };
  }
  if (s.type === 'note') {
    return { m: s.text ? (s.text.length > 36 ? s.text.slice(0, 35) + '…' : s.text) : '(empty)', p: '' };
  }
  return {
    m: s.area != null ? fmtArea(s.area) : '...',
    p: s.perimeter != null ? fmtPerim(s.perimeter) : ''
  };
}

function buildShapeRow(s) {
  const t = shapeMeasureText(s);
  const hideTip = s.hidden ? 'Show shape [H]' : 'Hide shape [H]';

  const $item = $('<div class="shape-item">')
    .toggleClass('selected', s.id === S.selId)
    .toggleClass('shape-hidden', !!s.hidden)
    .attr('data-id', s.id)
    .attr('draggable', 'true');

  $item.append(
    $('<button class="shape-swatch" title="Change color">')
      .attr('data-id', s.id).css('background', s.color)
  );

  const $info = $('<div class="shape-info">')
    .append($('<div class="shape-name" title="Double-click to rename">').text(s.name || ''))
    .append($('<div class="area">').text(t.m));
  if (t.p) $info.append($('<div class="perim">').text('P: ' + t.p));
  $item.append($info);

  $item.append(
    $('<button class="shape-eye">').attr('data-id', s.id).attr('title', hideTip)
      .html(s.hidden ? '&#9675;' : '&#9679;')
  );
  $item.append(
    $('<button class="shape-menu" title="Shape options">').attr('data-id', s.id).html('&#8942;')
  );
  $item.append(
    $('<button class="shape-del" title="Delete shape">').attr('data-id', s.id).html('&times;')
  );
  return $item;
}

export function updatePanel() {
  const $l = $('#shapes-list');
  $l.empty();

  let total = 0;
  let hasHidden = false;
  let curGroup = null;
  let collapsed = false;

  for (let i = 0; i < S.shapes.length; i++) {
    const s = S.shapes[i];
    if (s.hidden) hasHidden = true;
    if (s.type !== 'segment' && s.type !== 'note' && s.area != null) total += s.area;

    const g = s.group || null;
    if (g !== curGroup) {
      curGroup = g;
      collapsed = false;
      if (g) {
        let sub = 0, cnt = 0;
        for (let j = i; j < S.shapes.length && (S.shapes[j].group || null) === g; j++) {
          cnt++;
          const sj = S.shapes[j];
          if (sj.type !== 'segment' && sj.type !== 'note' && sj.area != null) sub += sj.area;
        }
        collapsed = !!_collapsedGroups[g];
        $l.append(
          $('<div class="group-header">').attr('data-group', g)
            .append($('<span class="group-caret">').html(collapsed ? '&#9656;' : '&#9662;'))
            .append($('<span class="group-name">').text(g))
            .append($('<span class="group-sub">').text(fmtArea(sub) + ' · ' + cnt))
        );
      }
    }

    if (g && collapsed) continue;
    const $row = buildShapeRow(s);
    if (g) $row.addClass('grouped');
    $l.append($row);
  }

  const tStr = S.shapes.length
    ? 'Total area: ' + fmtArea(total) + ' (' + S.shapes.length + ')'
    : 'No shapes yet';
  $('#shapes-total').text(tStr);

  if (hasHidden) {
    const n = S.shapes.filter(function(s) { return s.hidden; }).length;
    $('#hidden-count-label').text(n + ' hidden');
    $('#hidden-notice').css('display', 'flex');
  } else {
    $('#hidden-notice').css('display', 'none');
  }
}

// ---- Image Adjustments ----

export function updateFilters() {
  const b = 1 + S.brightness / 100;
  const c = 1 + S.contrast / 100;
  iCvs.style.filter = 'brightness(' + b + ') contrast(' + c + ')';
}

// ---- Brightness / Contrast Sliders ----

export function setSlider(name, val) {
  val = Math.max(-100, Math.min(100, Math.round(val)));

  if (name === 'bright') {
    S.brightness = val;
  } else {
    S.contrast = val;
  }

  const $grp = $('.sl-group [data-slider="' + name + '"]').closest('.sl-group');
  const pct = (val + 100) / 200;

  $grp.find('.sl-thumb').css('left', (pct * 100) + '%');

  const $fill = $grp.find('.sl-fill');
  if (val >= 0) {
    $fill.css({ left: '50%', width: (pct * 100 - 50) + '%' });
  } else {
    $fill.css({ left: (pct * 100) + '%', width: (50 - pct * 100) + '%' });
  }

  $grp.find('.sl-val').val(val);

  updateFilters();
}

export function syncSliders() {
  setSlider('bright', S.brightness);
  setSlider('contrast', S.contrast);
}

// ---- Dynamic Toolbar Label Shortening ----

const _shortLabels = [
  { id: 'btn-polygon',       full: 'Polygon',      short: 'Poly'      },
  { id: 'btn-freehand',      full: 'Freehand',     short: 'Free'      },
  { id: 'btn-segment',       full: 'Distance',     short: 'Dist'      },
  { id: 'btn-label',         full: 'Label',        short: 'Lbl'       },
  { id: 'btn-note',          full: 'Note',         short: 'Nt'        },
  { id: 'btn-delete',        full: 'Delete',       short: 'Del'       },
  { id: 'btn-clear',         full: 'Clear',        short: 'Clr'       },
  { id: 'btn-rotate-custom', full: 'Rotate\u2026', short: 'Rot\u2026' },
  { id: 'btn-persp',         full: 'Perspective',  short: 'Persp'     },
];

export function syncToolbarLabels() {
  const tb = document.getElementById('toolbar');
  if (!tb) return;
  _shortLabels.forEach(function(d) {
    const el = document.getElementById(d.id);
    if (el) el.textContent = d.full;
  });
  if (tb.getBoundingClientRect().height > 44) {
    _shortLabels.forEach(function(d) {
      const el = document.getElementById(d.id);
      if (el) el.textContent = d.short;
    });
  }
}
