// All DOM-update functions live here.
// Imports only state.js and geometry.js — no feature modules, no cycles.

import { S, iCvs, oCvs } from './state.js';
import { fmtArea, fmtPerim, fmtLen, findShape } from './geometry.js';
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
  S.scaleAreaShapeId = null;
  oCvs.style.cursor = '';
  $('#scale-popup').hide();
  $('#label-popup').hide();
  // Return keyboard focus to the app — a focused (hidden) popup input would
  // swallow hotkeys until the next click
  $('#scale-value, #label-value, #sq-side-value').blur();
  S.overlayDirty = true;
}

const TOOL_NAMES = {
  idle: 'No tool', scale: 'Scale', polygon: 'Polygon', freehand: 'Freehand',
  segment: 'Distance', edit: 'Edit', move: 'Move', label: 'Label',
  note: 'Note', squarecal: 'Square Cal'
};

export function setTool(t) {
  cancelTool();
  S.tool = t;

  $('#tool-display').text(TOOL_NAMES[t] || t);
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

  $('#scale-bar').toggleClass('visible', t === 'scale');
  if (t === 'scale') syncScaleBar();

  switch (t) {
    case 'idle':
      status(S.img ? 'Select a tool or click a shape' : 'Drop an image or click Open');
      break;
    case 'scale':
      status(S.scaleMode === 'area'
        ? 'Click a closed shape whose real area you know.'
        : 'Click first point of known distance');
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

// ---- Scale tool option bar (Distance / Known Area) ----

export function syncScaleBar() {
  const area = S.scaleMode === 'area';
  $('#scale-bar .persp-tab').removeClass('active');
  $('#scale-bar .persp-tab[data-scale-mode="' + (area ? 'area' : 'distance') + '"]').addClass('active');
  $('#scale-area-content').toggleClass('hidden', !area);
  if (area) {
    $('#scale-bar-unit').val(S.scaleUnit || 'cm');
    $('#scale-bar-value').val('');
    updateScaleAreaHint();
  }
}

export function updateScaleAreaHint() {
  const sh = findShape(S.scaleAreaShapeId);
  const anyClosed = S.shapes.some(function(s) { return s.closed && s.area != null; });
  $('#scale-area-hint').text(sh
    ? '"' + (sh.name || 'Shape') + '" selected — enter its real area.'
    : anyClosed
      ? 'Click a closed shape whose real area you know.'
      : 'No closed shapes yet — draw a Polygon or Freehand region first.');
  $('#scale-bar-apply').toggleClass('disabled', !sh);
}

// ---- Status Bar ----

export function status(t) {
  $('#status-text').text(t);
}

// ---- Toolbar State ----

export function enableTools(on) {
  const btns = $('#btn-scale, #btn-polygon, #btn-freehand, #btn-move, #btn-edit, #btn-segment, #btn-label, #btn-note, #btn-delete, #btn-undo, #btn-fit, #btn-persp, #btn-rotate-ccw, #btn-rotate-cw, #btn-rotate-custom');
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
  if (S.perspActive || S.rotateActive) emit(EVT.VIEW_CHANGE);
}

export function updateZoomDisp() {
  const t = Math.round(S.view.zoom * 100) + '%';
  $('#zoom-display').text(t);
  $('#scale-zoom-disp').text(t);
}

// ---- Scale / Measurements Display ----

export function updateScaleDisp() {
  if (S.scalePPU > 0) {
    $('#scale-display').text('1px=' + (1 / S.scalePPU).toFixed(3) + S.scaleUnit);
  } else {
    $('#scale-display').text('No scale');
  }
  updateScalePane();
}

// ---- Scale pane (sidebar) ----

// The reference is valid only while its geometry still exists.
export function scaleRefValid() {
  const ref = S.scaleRef;
  if (!ref || !(ref.value > 0)) return false;
  return ref.kind === 'area' ? !!findShape(ref.shapeId) : !!S.scaleLine;
}

function buildScaleRefRow(color, name, valText, tip) {
  const $info = $('<div class="shape-info">')
    .append($('<div class="shape-name">').text(name))
    .append($('<div class="area">').text(valText));
  if (S.scalePPU > 0) {
    $info.append($('<div class="perim">').text('1px = ' + (1 / S.scalePPU).toFixed(3) + S.scaleUnit));
  }
  return $('<div class="shape-item scale-ref-item">')
    .attr('tabindex', '0')
    .attr('role', 'button')
    .attr('title', tip)
    .attr('aria-label', 'Scale reference: ' + name + ', ' + valText)
    .append($('<span class="shape-swatch">').css('background', color))
    .append($info)
    .append($('<span class="scale-ref-badge" aria-hidden="true">').text('REF'));
}

export function updateScalePane() {
  const $slot = $('#scale-ref-slot');
  const $inp = $('#scale-pane-value');
  const ref = S.scaleRef;
  const valid = scaleRefValid();
  const isArea = valid && ref.kind === 'area';

  $slot.empty();
  if (isArea) {
    const sh = findShape(ref.shapeId);
    $slot.append(buildScaleRefRow(
      sh.color, sh.name || 'Area',
      ref.value + ' ' + S.scaleUnit + '²',
      'Reference area — click to edit its outline; the entered area stays fixed'
    ));
  } else if (valid) {
    $slot.append(buildScaleRefRow(
      '#4A9EFF', 'Scale line',
      ref.value + ' ' + S.scaleUnit,
      'Reference distance — click to edit the endpoints; the entered distance stays fixed'
    ));
  } else {
    $slot.append($('<div class="scale-ref-empty">').text('No reference — Scale tool sets one'));
  }

  // Without a reference the input is direct manual scale: 1 px = value unit
  $('#scale-pane-prefix').toggle(!valid);
  $('#scale-pane-unit option').each(function() {
    this.textContent = this.value + (isArea ? '²' : '');
  });
  // Never clobber the field mid-edit — that is exactly how entered values get lost
  if (document.activeElement !== $inp[0]) {
    if (valid) $inp.val(ref.value);
    else if (S.scalePPU > 0) $inp.val(+(1 / S.scalePPU).toPrecision(6));
    else $inp.val('');
  }
  $('#scale-pane-unit').val(S.scaleUnit);
}

// Selection-only refresh: toggles classes in place instead of rebuilding
// rows, so double-clicks (inline rename) and hover states survive.
export function updatePanelSelection() {
  $('#shapes-list .shape-item').each(function() {
    const sel = $(this).attr('data-id') === S.selId;
    $(this).toggleClass('selected', sel).attr('aria-selected', sel ? 'true' : 'false');
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

  const typeName = s.type === 'segment' ? 'distance' : s.type === 'note' ? 'note' : 'area';
  const label = (s.name || 'Unnamed') + ', ' + typeName + ' ' + t.m +
    (t.p ? ', perimeter ' + t.p : '') + (s.hidden ? ', hidden' : '');

  const $item = $('<div class="shape-item">')
    .toggleClass('selected', s.id === S.selId)
    .toggleClass('shape-hidden', !!s.hidden)
    .attr('data-id', s.id)
    .attr('draggable', 'true')
    .attr('tabindex', '0')
    .attr('role', 'option')
    .attr('aria-selected', s.id === S.selId ? 'true' : 'false')
    .attr('aria-label', label);

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
            .attr('tabindex', '0')
            .attr('role', 'button')
            .attr('aria-expanded', collapsed ? 'false' : 'true')
            .attr('aria-label', 'Group ' + g + ', ' + fmtArea(sub) + ', ' + cnt + ' shapes')
            .append($('<span class="group-caret" aria-hidden="true">').html(collapsed ? '&#9656;' : '&#9662;'))
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

  updateScalePane();
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
  $grp.find('.sl-track').attr('aria-valuenow', val);

  updateFilters();
}

export function syncSliders() {
  setSlider('bright', S.brightness);
  setSlider('contrast', S.contrast);
}

// ---- Dynamic Toolbar Reflow ----
//
// Stage 0: full labels, sliders inline.
// Stage 1: full labels, sliders collapsed into a popover button.
// Stage 2: short labels, sliders collapsed.
//
// Goal: fewest rows with elements maximally expanded. On resize each
// stage is applied fullest-first and its real wrapped row count read
// back; the fullest stage achieving the minimum row count wins. So a
// stage only degrades when that actually saves a row \u2014 if the toolbar
// must wrap regardless, labels and sliders unfold into the extra row
// space. The trial layouts happen inside the resize callback before
// paint, so they never flash.

function toolbarRows(tb) {
  let rows = 0;
  let prev = null;
  for (const el of tb.children) {
    const r = el.getBoundingClientRect();
    if (!r.width) continue;
    const center = r.top + r.height / 2;
    if (prev === null || center - prev > 2) {
      rows++;
      prev = center;
    }
  }
  return rows;
}

function applyToolbarStage(tb) {
  const rows = [];
  for (let s = 0; s <= 2; s++) {
    tb.dataset.stage = String(s);
    rows[s] = toolbarRows(tb);
    if (rows[s] === 1) break;
  }
  const best = rows.indexOf(Math.min.apply(null, rows));
  tb.dataset.stage = String(best);
  if (best === 0) {
    $('#tb-sliders').removeClass('open');
    $('#btn-sliders-toggle').attr('aria-expanded', 'false');
  }
}

export function initToolbarReflow() {
  const tb = document.getElementById('toolbar');
  if (!tb) return;

  applyToolbarStage(tb);

  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(function() {
      applyToolbarStage(tb);
    }).observe(tb);
  }
}
