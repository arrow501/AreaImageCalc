// .arcalc file format — HTML polyglot. Pure string functions, zero deps,
// Node-importable, fully unit-testable.
//
// A v2 .arcalc file is a self-describing HTML document: double-clicking it
// (or opening it in any browser) shows a short explanation and an
// "Open AreaImageCalc" link that opens the app in a new tab and hands the
// project over via a postMessage handshake, while the project data lives in
// an embedded JSON script tag. decodeArcalc also accepts the legacy v1
// format (plain JSON).

export const ARCALC_DATA_ID = 'arcalc-data';
export const APP_URL = 'https://areaimagecalc.pages.dev/';
export const HANDOFF_HASH = '#arcalc-handoff';
export const MSG_READY = 'arcalc-ready';
export const MSG_PROJECT = 'arcalc-project';

// Inline handoff script for the polyglot page: opens the app in a new tab
// with HANDOFF_HASH, waits for the app's MSG_READY handshake, then posts the
// embedded project JSON. Plain navigation remains the fallback (popup
// blocked, JS disabled, or an app version without the listener).
// Must never contain the character sequence "</script".
function handoffScript() {
  return '(function(){\n' +
'const link=document.getElementById("arcalc-open");\n' +
'const note=document.getElementById("arcalc-note");\n' +
'const fallbackMsg=note.textContent;\n' +
'let win=null;\n' +
'let timer=0;\n' +
'window.addEventListener("message",function(e){\n' +
'if(!win||e.source!==win||!e.data||e.data.type!=="' + MSG_READY + '")return;\n' +
'const json=document.getElementById("' + ARCALC_DATA_ID + '").textContent;\n' +
'win.postMessage({type:"' + MSG_PROJECT + '",project:JSON.parse(json)},new URL(link.href).origin);\n' +
'clearTimeout(timer);\n' +
'note.textContent="Project opened in the AreaImageCalc tab.";\n' +
'});\n' +
'link.addEventListener("click",function(ev){\n' +
'const w=window.open(link.href,"_blank");\n' +
'if(!w)return;\n' +
'ev.preventDefault();\n' +
'win=w;\n' +
'note.textContent="Opening AreaImageCalc\\u2026";\n' +
'clearTimeout(timer);\n' +
'timer=setTimeout(function(){note.textContent=fallbackMsg;},15000);\n' +
'});\n' +
'})();';
}

export function encodeArcalc(project, appUrl) {
  const url = appUrl || APP_URL;
  // <-escape so the payload can never terminate the script element
  const json = JSON.stringify(project).replace(/</g, '\\u003c');
  return '<!DOCTYPE html>\n' +
'<html lang="en">\n' +
'<head>\n' +
'<meta charset="utf-8">\n' +
'<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
'<title>AreaImageCalc project</title>\n' +
'<style>\n' +
'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;' +
'background:#1a1a1a;color:#e0e0e0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}\n' +
'main{max-width:420px;padding:40px 28px;text-align:center}\n' +
'h1{font-size:18px;margin:0 0 12px;color:#FF6B35}\n' +
'p{font-size:14px;line-height:1.6;color:#aaa;margin:0 0 10px}\n' +
'a{display:inline-block;margin-top:14px;padding:10px 22px;background:#FF6B35;color:#fff;' +
'text-decoration:none;border-radius:4px;font-weight:600;font-size:14px}\n' +
'a:hover{background:#e55a20}\n' +
'</style>\n' +
'</head>\n' +
'<body>\n' +
'<main>\n' +
'<h1>AreaImageCalc project file</h1>\n' +
'<p>This file contains measurements made with AreaImageCalc, a free browser-based area measurement tool.</p>\n' +
'<p id="arcalc-note">Click below to open the app with this project loaded. If it does not load automatically, drop this file onto the app page (or use its Open button).</p>\n' +
'<a id="arcalc-open" href="' + url + HANDOFF_HASH + '">Open AreaImageCalc</a>\n' +
'</main>\n' +
'<script type="application/json" id="' + ARCALC_DATA_ID + '">' + json + '</script>\n' +
'<script>' + handoffScript() + '</script>\n' +
'</body>\n' +
'</html>\n';
}

// Accepts v2 (HTML polyglot) and v1 (plain JSON) content. Throws on
// anything unrecognisable.
export function decodeArcalc(text) {
  const src = String(text).replace(/^﻿/, '');
  const trimmed = src.trimStart();
  if (trimmed[0] === '{') return JSON.parse(trimmed);

  const open = new RegExp('<script[^>]*id="' + ARCALC_DATA_ID + '"[^>]*>').exec(src);
  if (!open) throw new Error('Not an AreaImageCalc project file');
  const start = open.index + open[0].length;
  const end = src.indexOf('</script>', start);
  if (end < 0) throw new Error('Project file is truncated');
  return JSON.parse(src.slice(start, end));
}
