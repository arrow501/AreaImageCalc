import { S, fn, imgWorker } from './state.js';

var PDFJS_VERSION = '3.11.174';
var PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + PDFJS_VERSION + '/';

var _pdfJsReady = false;
var _pendingCallbacks = [];

function ensurePdfJs(callback) {
  if (_pdfJsReady) { callback(); return; }
  _pendingCallbacks.push(callback);
  if (_pendingCallbacks.length > 1) return; // already loading

  var s = document.createElement('script');
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
    var pages = [];
    for (var i = 1; i <= maxPage; i++) pages.push(i);
    return pages;
  }
  var result = [];
  var seen = {};
  var parts = str.split(',');
  for (var pi = 0; pi < parts.length; pi++) {
    var part = parts[pi].trim();
    var dash = part.indexOf('-');
    if (dash > 0) {
      var a = parseInt(part.substring(0, dash));
      var b = parseInt(part.substring(dash + 1));
      if (!isNaN(a) && !isNaN(b)) {
        for (var n = Math.min(a, b); n <= Math.max(a, b); n++) {
          if (n >= 1 && n <= maxPage && !seen[n]) { result.push(n); seen[n] = true; }
        }
      }
    } else {
      var p = parseInt(part);
      if (!isNaN(p) && p >= 1 && p <= maxPage && !seen[p]) { result.push(p); seen[p] = true; }
    }
  }
  result.sort(function(a, b) { return a - b; });
  return result;
}

async function renderPdfPage(pdfDoc, pageNum, dpi) {
  dpi = dpi || 150;
  var page = await pdfDoc.getPage(pageNum);
  var scale = dpi / 72;
  var viewport = page.getViewport({ scale: scale });
  var canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
  return canvas.toDataURL('image/png');
}

export function renderPdfTabPage(tabIdx) {
  var tab = S.tabs[tabIdx];
  if (!tab || !tab.pdfSource) return;

  ensurePdfJs(function() {
    var src = tab.pdfSource;
    src.pdfDoc.getPage(src.pageNum).then(function(page) {
      var scale = 150 / 72;
      var viewport = page.getViewport({ scale: scale });
      var canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      return page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise.then(function() {
        // Kick off WebP encode while canvas is still in scope
        tab.webpPending = true;
        if (fn.getWebpMode && fn.getWebpMode() === 'remote') {
          new Promise(function(resolve) { canvas.toBlob(resolve, 'image/png'); })
            .then(function(blob) { blob ? fn.cfEncode(tab, blob) : (tab.webpPending = false); });
        } else {
          createImageBitmap(canvas).then(function(bitmap) {
            imgWorker.postMessage({ type: 'encodeWebP', id: tab.tabId, bitmap: bitmap }, [bitmap]);
          }).catch(function() {
            if (fn.cfEncode) {
              new Promise(function(resolve) { canvas.toBlob(resolve, 'image/png'); })
                .then(function(blob) { blob ? fn.cfEncode(tab, blob) : (tab.webpPending = false); });
            } else {
              tab.webpPending = false;
            }
          });
        }
        return canvas.toDataURL('image/png');
      });
    }).then(function(dataUrl) {
      tab.imgDataUrl = dataUrl;
      tab.pdfSource = null; // rendered, no longer needs lazy render

      var ni = new Image();
      ni.onload = function() {
        tab.img = ni;
        tab.view.iw = ni.naturalWidth;
        tab.view.ih = ni.naturalHeight;

        if (S.currentTabIdx !== tabIdx) return;

        S.img = ni;
        S.imgDataUrl = dataUrl;
        S.view.iw = ni.naturalWidth;
        S.view.ih = ni.naturalHeight;
        S.FH_MIN_DIST = Math.max(1, Math.log2(S.view.iw + S.view.ih) - 8.5);

        if (fn.fitView) fn.fitView();
        if (fn.updateScaleDisp) fn.updateScaleDisp();
        if (fn.updateFilters) fn.updateFilters();
        if (fn.enableTools) fn.enableTools(true);
        if (fn.updatePanel) fn.updatePanel();
        $('#dropzone').css('pointer-events', 'none').find('.dz-content').hide();
        if (fn.status) fn.status('Page ' + src.pageNum + ' loaded (' + ni.naturalWidth + '\u00d7' + ni.naturalHeight + ').');
      };
      ni.src = dataUrl;
    }).catch(function(err) {
      console.error('PDF page render error:', err);
      if (fn.status) fn.status('Failed to render PDF page ' + src.pageNum);
    });
  });
}

export function loadPdf(file) {
  ensurePdfJs(function() {
    var reader = new FileReader();
    reader.onload = function(e) {
      var data = new Uint8Array(e.target.result);
      window.pdfjsLib.getDocument({ data: data }).promise.then(function(pdfDoc) {
        var numPages = pdfDoc.numPages;
        $('#pdf-page-count').text('(' + numPages + ' page' + (numPages !== 1 ? 's' : '') + ')');
        $('#pdf-page-range').val('');
        $('#pdf-modal').show();

        $('#pdf-modal-cancel').off('click').on('click', function() {
          $('#pdf-modal').hide();
        });

        $('#pdf-modal-load').off('click').on('click', function() {
          $('#pdf-modal').hide();
          var rangeStr = $('#pdf-page-range').val();
          var pages = parsePdfRange(rangeStr, numPages);
          if (!pages.length) { alert('No valid pages selected.'); return; }

          var baseName = file.name.replace(/\.pdf$/i, '');
          var firstIdx = -1;

          for (var pi = 0; pi < pages.length; pi++) {
            var pageNum = pages[pi];
            var label = pages.length === 1 ? baseName : (baseName + ' p' + pageNum);
            var idx = fn.createTab(label, null, null);
            S.tabs[idx].pdfSource = { pdfDoc: pdfDoc, pageNum: pageNum };
            if (firstIdx < 0) firstIdx = idx;
          }

          if (firstIdx >= 0 && fn.switchToTab) fn.switchToTab(firstIdx);
          if (fn.renderTabBar) fn.renderTabBar();
          if (fn.status) fn.status('Loading ' + pages.length + ' PDF page(s)...');
        });
      }).catch(function(err) {
        console.error('PDF load error:', err);
        alert('Failed to load PDF: ' + (err.message || err));
      });
    };
    reader.readAsArrayBuffer(file);
  });
}
