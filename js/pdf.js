import { S, imgWorker } from './state.js';
import { createTab, switchToTab, renderSidebar } from './tabs.js';
import { fitView, updateScaleDisp, updateFilters, enableTools, updatePanel, status } from './ui.js';
import { EVT, on } from './events.js';

// Lazy PDF page render triggered by tabs.js when switching to an unrendered PDF tab
on(EVT.TAB_RENDER_PDF, function(e, idx) { renderPdfTabPage(idx); });

const PDFJS_VERSION = '3.11.174';
const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + PDFJS_VERSION + '/';

let _pdfJsReady = false;
let _pendingCallbacks = [];

function ensurePdfJs(callback) {
  if (_pdfJsReady) { callback(); return; }
  _pendingCallbacks.push(callback);
  if (_pendingCallbacks.length > 1) return; // already loading

  const s = document.createElement('script');
  s.src = PDFJS_CDN + 'pdf.min.js';
  s.onload = function() {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_CDN + 'pdf.worker.min.js';
    _pdfJsReady = true;
    _pendingCallbacks.forEach(function(cb) { cb(); });
    _pendingCallbacks = [];
  };
  s.onerror = function() {
    alert('Failed to load PDF.js library. Check your internet connection.');
    _pendingCallbacks = [];
  };
  document.head.appendChild(s);
}

function parsePdfRange(str, maxPage) {
  if (!str || str.trim() === '' || str.trim().toLowerCase() === 'all') {
    const pages = [];
    for (let i = 1; i <= maxPage; i++) pages.push(i);
    return pages;
  }
  const result = [];
  const seen = {};
  const parts = str.split(',');
  for (let pi = 0; pi < parts.length; pi++) {
    const part = parts[pi].trim();
    const dash = part.indexOf('-');
    if (dash > 0) {
      const a = parseInt(part.substring(0, dash));
      const b = parseInt(part.substring(dash + 1));
      if (!isNaN(a) && !isNaN(b)) {
        for (let n = Math.min(a, b); n <= Math.max(a, b); n++) {
          if (n >= 1 && n <= maxPage && !seen[n]) { result.push(n); seen[n] = true; }
        }
      }
    } else {
      const p = parseInt(part);
      if (!isNaN(p) && p >= 1 && p <= maxPage && !seen[p]) { result.push(p); seen[p] = true; }
    }
  }
  result.sort(function(a, b) { return a - b; });
  return result;
}

export function renderPdfTabPage(tabIdx) {
  const tab = S.tabs[tabIdx];
  if (!tab || !tab.pdfSource) return;

  ensurePdfJs(function() {
    const src = tab.pdfSource;
    src.pdfDoc.getPage(src.pageNum).then(function(page) {
      const scale = 150 / 72;
      const viewport = page.getViewport({ scale: scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      return page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise.then(function() {
        // Kick off WebP encode while canvas is still in scope
        tab.webpPending = true;
        createImageBitmap(canvas).then(function(bitmap) {
          imgWorker.postMessage({ type: 'encodeWebP', id: tab.tabId, bitmap: bitmap }, [bitmap]);
        }).catch(function() { tab.webpPending = false; });
        return canvas.toDataURL('image/png');
      });
    }).then(function(dataUrl) {
      tab.imgDataUrl = dataUrl;
      tab.pdfSource = null; // rendered, no longer needs lazy render

      const ni = new Image();
      ni.onload = function() {
        tab.img = ni;
        tab.baseImg = ni;
        tab.baseRotation = 0;
        tab.view.iw = ni.naturalWidth;
        tab.view.ih = ni.naturalHeight;

        if (S.currentTabIdx !== tabIdx) return;

        S.img = ni;
        S.imgDataUrl = dataUrl;
        S.view.iw = ni.naturalWidth;
        S.view.ih = ni.naturalHeight;

        fitView();
        updateScaleDisp();
        updateFilters();
        enableTools(true);
        updatePanel();
        $('#dropzone').css('pointer-events', 'none').find('.dz-content').hide();
        status('Page ' + src.pageNum + ' loaded (' + ni.naturalWidth + '\u00d7' + ni.naturalHeight + ').');
      };
      ni.src = dataUrl;
    }).catch(function(err) {
      console.error('PDF page render error:', err);
      status('Failed to render PDF page ' + src.pageNum);
    });
  });
}

// ---- Import modal: thumbnail grid page picker ----

const THUMB_W = 92;          // thumbnail width, px
const THUMB_RENDER_MAX = 80; // beyond this only numbered placeholders are shown

let _modalToken = 0;

function selectedPages() {
  const pages = [];
  $('#pdf-thumbs .pdf-thumb.selected').each(function() {
    pages.push(parseInt($(this).data('page'), 10));
  });
  pages.sort(function(a, b) { return a - b; });
  return pages;
}

function updatePdfCount(numPages) {
  const n = selectedPages().length;
  $('#pdf-page-count').text(n + ' of ' + numPages + ' page' + (numPages !== 1 ? 's' : '') + ' selected');
  $('#pdf-modal-load').toggleClass('disabled', n === 0);
}

function setSelection(pages) {
  const set = {};
  for (let i = 0; i < pages.length; i++) set[pages[i]] = true;
  $('#pdf-thumbs .pdf-thumb').each(function() {
    $(this).toggleClass('selected', !!set[$(this).data('page')]);
  });
}

function renderThumbs(pdfDoc, numPages, token) {
  const $grid = $('#pdf-thumbs').empty();

  for (let p = 1; p <= numPages; p++) {
    $grid.append(
      $('<div class="pdf-thumb selected">').attr('data-page', p)
        .append($('<div class="pdf-thumb-box">'))
        .append($('<span class="pdf-thumb-num">').text(p))
    );
  }

  const renderCount = Math.min(numPages, THUMB_RENDER_MAX);
  (function renderNext(p) {
    if (p > renderCount || token !== _modalToken) return;
    pdfDoc.getPage(p).then(function(page) {
      if (token !== _modalToken) return;
      const base = page.getViewport({ scale: 1 });
      const scale = THUMB_W / base.width;
      const viewport = page.getViewport({ scale: scale });
      const cvs = document.createElement('canvas');
      cvs.width = Math.round(viewport.width);
      cvs.height = Math.round(viewport.height);
      return page.render({ canvasContext: cvs.getContext('2d'), viewport: viewport }).promise.then(function() {
        if (token !== _modalToken) return;
        $grid.find('.pdf-thumb[data-page="' + p + '"] .pdf-thumb-box').empty().append(cvs);
        renderNext(p + 1);
      });
    }).catch(function() { renderNext(p + 1); });
  })(1);
}

export function loadPdf(file, onDone) {
  ensurePdfJs(function() {
    const reader = new FileReader();
    reader.onload = function(e) {
      const data = new Uint8Array(e.target.result);
      window.pdfjsLib.getDocument({ data: data }).promise.then(function(pdfDoc) {
        const numPages = pdfDoc.numPages;
        const token = ++_modalToken;

        $('#pdf-modal-title').text(file.name);
        $('#pdf-page-range').val('');
        $('#pdf-modal').show();
        renderThumbs(pdfDoc, numPages, token);
        updatePdfCount(numPages);

        const $thumbs = $('#pdf-thumbs');
        $thumbs.off('click').on('click', '.pdf-thumb', function() {
          $(this).toggleClass('selected');
          $('#pdf-page-range').val('');
          updatePdfCount(numPages);
        });

        $('#pdf-page-range').off('input').on('input', function() {
          setSelection(parsePdfRange(this.value, numPages));
          updatePdfCount(numPages);
        });

        $('#pdf-select-all').off('click').on('click', function() {
          $thumbs.find('.pdf-thumb').addClass('selected');
          $('#pdf-page-range').val('');
          updatePdfCount(numPages);
        });

        $('#pdf-select-none').off('click').on('click', function() {
          $thumbs.find('.pdf-thumb').removeClass('selected');
          $('#pdf-page-range').val('');
          updatePdfCount(numPages);
        });

        function closeModal() {
          _modalToken++;
          $('#pdf-modal').hide();
          $('#pdf-thumbs').empty();
          $(document).off('keydown.pdfmodal');
        }

        $('#pdf-modal-cancel').off('click').on('click', function() {
          closeModal();
          pdfDoc.destroy();
          if (onDone) onDone();
        });

        function doLoad() {
          const pages = selectedPages();
          if (!pages.length) return;
          closeModal();
          // Advance the queue before rendering so the next file can start
          if (onDone) onDone();

          const baseName = file.name.replace(/\.pdf$/i, '');
          const multi = pages.length > 1;
          const docId = multi ? S.docN++ : null;
          let firstIdx = -1;

          for (let pi = 0; pi < pages.length; pi++) {
            const pageNum = pages[pi];
            const idx = createTab(
              multi ? baseName + ' p' + pageNum : baseName,
              null, null,
              multi ? { docId: docId, docLabel: baseName, pageNum: pageNum } : null
            );
            S.tabs[idx].pdfSource = { pdfDoc: pdfDoc, pageNum: pageNum };
            if (firstIdx < 0) firstIdx = idx;
          }

          if (firstIdx >= 0) switchToTab(firstIdx);
          renderSidebar();
          status('Loading ' + pages.length + ' PDF page(s)...');
        }

        $('#pdf-modal-load').off('click').on('click', doLoad);
        $('#pdf-page-range').off('keydown').on('keydown', function(ev) {
          if (ev.key === 'Enter') { doLoad(); ev.preventDefault(); }
        });

        $(document).off('keydown.pdfmodal').on('keydown.pdfmodal', function(ev) {
          if (ev.key === 'Enter' && ev.target.tagName !== 'INPUT') { doLoad(); ev.preventDefault(); }
          if (ev.key === 'Escape') { $('#pdf-modal-cancel').trigger('click'); ev.preventDefault(); }
        });
      }).catch(function(err) {
        console.error('PDF load error:', err);
        alert('Failed to load PDF: ' + (err.message || err));
        if (onDone) onDone();
      });
    };
    reader.readAsArrayBuffer(file);
  });
}
