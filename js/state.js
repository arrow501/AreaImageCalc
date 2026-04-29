export { COLORS, SAVE_KEY, SAVE_VER, SAVE_VER_LEGACY, STORAGE_SOFT_LIMIT, STORAGE_HARD_LIMIT } from './constants.js';

// Shared mutable state — every module imports S and reads/writes S.xxx
export const S = {
  // Color palette
  colorIdx: 0,

  // View state (pan, zoom)
  view: { ox: 0, oy: 0, zoom: 1, fit: 1, iw: 0, ih: 0 },

  // Image
  img: null,
  imgDataUrl: null,

  // Shapes
  shapes: [],
  selId: null,
  shapeN: 0,

  // Scale calibration
  scalePPU: 0,
  scaleUnit: 'cm',
  scaleLine: null,
  scaleState: 0,
  scaleP1: null,
  scaleP2: null,

  // Current tool
  tool: 'idle',

  // Drawing state
  polyPts: [],
  fhPts: [],
  isFH: false,
  fhLastTime: 0,

  // Freehand sampling thresholds (image-space px)
  FH_MIN_DIST: 0,
  FH_MAX_DIST: 100,

  // Pan state
  isPan: false,
  panSt: null,
  spaceHeld: false,

  // Edit tool drag state
  dragPt: null,
  dragShape: null,
  dragIdx: -1,

  // Rendering flags
  imageDirty: true,
  overlayDirty: true,
  interacting: false,
  qualTimer: null,

  // Canvas dimensions
  dpr: window.devicePixelRatio || 1,
  cw: 0,
  ch: 0,
  canvasRect: { left: 0, top: 0 },

  // Mouse position (screen and image space)
  mx: 0, my: 0,
  mix: 0, miy: 0,

  // Persistence
  saveTimer: null,
  pendingSave: false,

  // Image adjustments
  brightness: 0,
  contrast: 0,

  // Perspective correction (manual)
  perspActive: false,
  perspCorners: null,
  perspSrcCorners: null,
  perspDragIdx: -1,
  perspDragOffset: null,

  // (Square calibration uses S.tool === 'squarecal' + S.polyPts — no separate state)

  // Touch
  touchId: null,
  touchIsPan: false,
  touchPinchDist: 0,
  touchPinchMid: null,
  touchPanSt: null,

  // Tabs
  tabs: [],          // array of tab state objects
  currentTabIdx: -1, // index of active tab
  tabN: 0,           // tab ID counter (monotonically increasing)

  // Storage UI state
  hardLimitDialogShown: false,
  storageFull: false,
  saveErrored: false,

  // Label tool state
  labelShapeId: null,

  // Drag-based rotation state (null = inactive)
  rotDrag: null
};

// DOM references (module scripts are deferred, so DOM exists)
export const $wrap = $('#canvas-wrap');
export const iCvs = document.getElementById('image-canvas');
export const oCvs = document.getElementById('overlay-canvas');
export const iCtx = iCvs.getContext('2d');
export const oCtx = oCvs.getContext('2d');

// Workers
export const worker = new Worker('./js/worker.js');
export const imgWorker = new Worker('./js/imageWorker.js');
