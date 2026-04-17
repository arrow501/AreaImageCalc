// All DOM-update functions live here.
// Imports only state.js and geometry.js — no feature modules, no cycles.

import { S, iCvs } from './state.js';
import { fmtArea, fmtPerim, fmtLen } from './geometry.js';

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
  S.touchId = null;
  S.touchIsPan = false;
  S.labelShapeId = null;
  $('#scale-popup').hide();
  $('#label-popup').hide();
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

  if (t === 'scale' || t === 'polygon' || t === 'freehand' || t === 'squarecal' || t === 'segment') {
    $('body').addClass('cursor-crosshair');
  }
  if (t === 'edit') {
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
      status('Click to place vertices. Click first point or double-click to close. ESC cancels.');
      break;
    case 'freehand':
      status('Click and drag to trace. Release to finish. ESC cancels.');
      break;
    case 'segment':
      status('Click to place points along a path. Double-click or Enter to finish. ESC cancels.');
      break;
    case 'edit':
      status('Drag control points to edit shapes. ESC to exit.');
      break;
    case 'label':
      status('Click a shape to rename it.');
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
  const btns = $('#btn-scale, #btn-polygon, #btn-freehand, #btn-edit, #btn-segment, #btn-label, #btn-delete, #btn-clear, #btn-fit, #btn-persp, #btn-rotate-ccw, #btn-rotate-cw, #btn-rotate-custom');
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
  if (S.perspActive) $(document).trigger('view:change');
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

function _esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function updatePanel() {
  const $l = $('#shapes-list');
  $l.empty();

  let total = 0;
  let hasHidden = false;

  for (let i = 0; i < S.shapes.length; i++) {
    const s = S.shapes[i];
    if (s.hidden) hasHidden = true;

    let mStr, pStr = '';
    if (s.type === 'segment') {
      mStr = s.length != null ? fmtLen(s.length) : '...';
    } else {
      mStr = s.area != null ? fmtArea(s.area) : '...';
      pStr = s.perimeter != null ? fmtPerim(s.perimeter) : '';
      if (s.area != null) total += s.area;
    }

    const hideTip = s.hidden ? 'Show shape [H]' : 'Hide shape [H]';
    const hideChar = s.hidden ? '&#9675;' : '&#9679;';

    $l.append(
      '<div class="shape-item' + (s.id === S.selId ? ' selected' : '') + (s.hidden ? ' shape-hidden' : '') + '" data-id="' + s.id + '">' +
        '<div class="shape-swatch" style="background:' + s.color + '"></div>' +
        '<div class="shape-info">' +
          '<div class="shape-name">' + _esc(s.name || '') + '</div>' +
          '<div class="area">' + mStr + '</div>' +
          (pStr ? '<div class="perim">P: ' + pStr + '</div>' : '') +
        '</div>' +
        '<button class="shape-eye" data-id="' + s.id + '" title="' + hideTip + '">' + hideChar + '</button>' +
        '<button class="shape-del" data-id="' + s.id + '">&times;</button>' +
      '</div>'
    );
  }

  const tStr = S.shapes.length
    ? 'Total area: ' + fmtArea(total) + ' (' + S.shapes.length + ')'
    : 'No shapes yet';
  $('#shapes-total').text(tStr);

  $('#btn-showall').toggleClass('disabled', !hasHidden);
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
