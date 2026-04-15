import { S, imgWorker } from './state.js';
import { createTab, switchToTab, renderTabBar } from './tabs.js';
import { fitView, updateScaleDisp, updateFilters, enableTools, updatePanel, status } from './ui.js';

// Lazy PDF page render triggered by tabs.js when switching to an unrendered PDF tab
$(document).on('tab:renderPdf', function(e, idx) { renderPdfTabPage(idx); });

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

async function renderPdfPage(pdfDoc, pageNum, dpi) {
  dpi = dpi || 150;
  const page = await pdfDoc.getPage(pageNum);
  const scale = dpi / 72;
  const viewport = page.getViewport({ scale: scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
  return canvas.toDataURL('image/png');
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
        tab.view.iw = ni.naturalWidth;
        tab.view.ih = ni.naturalHeight;

        if (S.currentTabIdx !== tabIdx) return;

        S.img = ni;
        S.imgDataUrl = dataUrl;
        S.view.iw = ni.naturalWidth;
        S.view.ih = ni.naturalHeight;
        S.FH_MIN_DIST = Math.max(1, Math.log2(S.view.iw + S.view.ih) - 8.5);

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

export function loadPdf(file, onDone) {
  ensurePdfJs(function() {
    const reader = new FileReader();
    reader.onload = function(e) {
      const data = new Uint8Array(e.target.result);
      window.pdfjsLib.getDocument({ data: data }).promise.then(function(pdfDoc) {
        const numPages = pdfDoc.numPages;
        $('#pdf-page-count').text('(' + numPages + ' page' + (numPages !== 1 ? 's' : '') + ')');
        $('#pdf-page-range').val('');
        $('#pdf-modal').show();

        $('#pdf-modal-cancel').off('click').on('click', function() {
          $('#pdf-modal').hide();
          if (onDone) onDone();
        });

        $('#pdf-modal-load').off('click').on('click', function() {
          $('#pdf-modal').hide();
          // Advance the queue before rendering so the next file can start
          if (onDone) onDone();

          const rangeStr = $('#pdf-page-range').val();
          const pages = parsePdfRange(rangeStr, numPages);
          if (!pages.length) { alert('No valid pages selected.'); return; }

          const baseName = file.name.replace(/\.pdf$/i, '');
          let firstIdx = -1;

          for (let pi = 0; pi < pages.length; pi++) {
            const pageNum = pages[pi];
            const label = pages.length === 1 ? baseName : (baseName + ' p' + pageNum);
            const idx = createTab(label, null, null);
            S.tabs[idx].pdfSource = { pdfDoc: pdfDoc, pageNum: pageNum };
            if (firstIdx < 0) firstIdx = idx;
          }

          if (firstIdx >= 0) switchToTab(firstIdx);
          renderTabBar();
          status('Loading ' + pages.length + ' PDF page(s)...');
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
