export const EVT = {
  STORAGE_UPDATE: 'storage:update',
  VIEW_CHANGE:    'view:change',
  TAB_SWITCH:     'tab:switch',
  TAB_RENDER_PDF: 'tab:renderPdf',
  SQCAL_CANCEL:   'squarecal:cancel',
};

const $doc = $(document);

export function emit(name, detail) {
  $doc.trigger(name, detail);
}

export function on(name, fn) {
  $doc.on(name, fn);
}
