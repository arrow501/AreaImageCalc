// All DOM-update functions live here.
// Imports only state.js and geometry.js — no feature modules, no cycles.

import { S, iCvs } from './state.js';
import { fmtArea, fmtPerim } from './geometry.js';

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
  $('#scale-popup').hide();
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

  if (t === 'scale' || t === 'polygon' || t === 'freehand' || t === 'squarecal') {
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
    case 'edit':
      status('Drag control points to edit shapes. ESC to exit.');
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
  const btns = $('#btn-scale, #btn-polygon, #btn-freehand, #btn-edit, #btn-delete, #btn-clear, #btn-fit, #btn-persp, #btn-rotate-ccw, #btn-rotate-cw, #btn-rotate-custom');
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

export function updatePanel() {
  const $l = $('#shapes-list');
  $l.empty();

  let total = 0;

  for (let i = 0; i < S.shapes.length; i++) {
    const s = S.shapes[i];
    const aStr = s.area != null ? fmtArea(s.area) : '...';
    const pStr = s.perimeter != null ? fmtPerim(s.perimeter) : '';

    if (s.area != null) total += s.area;

    $l.append(
      '<div class="shape-item' + (s.id === S.selId ? ' selected' : '') + '" data-id="' + s.id + '">' +
        '<div class="shape-swatch" style="background:' + s.color + '"></div>' +
        '<div class="shape-info">' +
          '<div class="area">' + aStr + '</div>' +
          (pStr ? '<div class="perim">P: ' + pStr + '</div>' : '') +
        '</div>' +
        '<button class="shape-del" data-id="' + s.id + '">&times;</button>' +
      '</div>'
    );
  }

  const tStr = S.shapes.length
    ? 'Total: ' + fmtArea(total) + ' (' + S.shapes.length + ')'
    : 'No shapes yet';
  $('#shapes-total').text(tStr);
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
