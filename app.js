// ── Config ───────────────────────────────────────────────────────────────────
// Baked into this bundle at release time — the single baseline this running
// copy of the app compares itself against. Keep in sync with version.json's
// "version" field and the numeric suffix of sw.js's CACHE_NAME (see README
// "Versioning & Updates" for the full release checklist).
const APP_VERSION = '5.8.1';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({length: 5}, (_, i) => CURRENT_YEAR + i); // current year + 4 ahead

const INCOME_COLOUR = '#e5e5ea'; // Income's default fixed colour, independently selectable from expense palette
const UNDO_LIMIT = 10; // maximum undo/redo steps retained

// 16-colour palette used for expense category headers and pie chart slices.
// Two properties are deliberately engineered, not just picked by eye:
// - every colour clears WCAG AA (4.5:1) against the header's fixed black
//   text (#3a3a3c) — 10 of the original 16 didn't
// - colours are ordered so consecutive entries are far apart in hue (worst
//   case ~106° apart, verified computationally), since PALETTE order is what
//   both DEFAULT_CATEGORIES and getNextColour() hand out to adjacent pie
//   chart slices
const PALETTE = [
  '#A3CB38', '#5DADE2', '#FF7E7E', '#1ABC9C', // Lime, Blue, Coral Red, Teal
  '#D89676', '#9BA7B2', '#FF9F43', '#74AAE2', // Brown, Slate, Orange, Steel Blue
  '#F39C12', '#99A2D8', '#F1C40F', '#C096D1', // Amber, Indigo, Yellow, Purple
  '#86AF8B', '#FF76B8', '#2ECC71', '#F081B7'  // Sage, Pink, Emerald, Rose
];

// Old (pre-contrast-fix) palette hex values, mapped to their new equivalent.
// Applied when loading category data so categories created before this fix
// automatically pick up the corrected colour next time they're opened,
// rather than only affecting categories created from now on.
const PALETTE_COLOUR_MIGRATIONS = {
  '#FF6B6B': '#FF7E7E', // Coral Red
  '#3498DB': '#5DADE2', // Blue
  '#9B59B6': '#C096D1', // Purple
  '#FF6EB4': '#FF76B8', // Pink
  '#5C6BC0': '#99A2D8', // Indigo
  '#E84393': '#F081B7', // Rose
  '#4A90D9': '#74AAE2', // Steel Blue
  '#6D9E73': '#86AF8B', // Sage
  '#A0522D': '#D89676', // Brown
  '#708090': '#9BA7B2'  // Slate
};

// Default category set used when a month has no saved data yet
const DEFAULT_CATEGORIES = [
  { name: 'Income',        colour: INCOME_COLOUR, isIncome: true,  rows: [{ expense: '', cost: '', paid: false, mode: 'fully-paid', runningTotal: '' }] },
  { name: 'Tithes',        colour: PALETTE[0],    isIncome: false, rows: [{ expense: '', cost: '', paid: false, mode: 'fully-paid', runningTotal: '' }] },
  { name: 'Home',          colour: PALETTE[1],    isIncome: false, rows: [{ expense: '', cost: '', paid: false, mode: 'fully-paid', runningTotal: '' }] },
  { name: 'Vehicles',      colour: PALETTE[2],    isIncome: false, rows: [{ expense: '', cost: '', paid: false, mode: 'fully-paid', runningTotal: '' }] },
  { name: 'Debits',        colour: PALETTE[3],    isIncome: false, rows: [{ expense: '', cost: '', paid: false, mode: 'fully-paid', runningTotal: '' }] },
  { name: 'Food',          colour: PALETTE[4],    isIncome: false, rows: [{ expense: '', cost: '', paid: false, mode: 'fully-paid', runningTotal: '' }] },
  { name: 'Fuel',          colour: PALETTE[5],    isIncome: false, rows: [{ expense: '', cost: '', paid: false, mode: 'fully-paid', runningTotal: '' }] },
  { name: 'Entertainment', colour: PALETTE[6],    isIncome: false, rows: [{ expense: '', cost: '', paid: false, mode: 'fully-paid', runningTotal: '' }] },
  { name: 'Miscellaneous', colour: PALETTE[7],    isIncome: false, rows: [{ expense: '', cost: '', paid: false, mode: 'fully-paid', runningTotal: '' }] }
];

let currentYear  = CURRENT_YEAR;
let currentMonth = new Date().getMonth();

// Restore last viewed month/year if the app was previously opened —
// keeps the user on whatever month they were looking at when they last
// closed or minimized the app, rather than always resetting to today's month
const savedView = loadLastViewedMonth();
if (savedView && YEARS.includes(savedView.year) && savedView.month >= 0 && savedView.month <= 11) {
  currentYear = savedView.year;
  currentMonth = savedView.month;
}

// ── Minimal SVG Icon Set ─────────────────────────────────────────────────────
// Bold, minimal line icons used in the main menu and category rename action,
// matching the flat modern line-icon style requested for the app (distinct
// from the colourful rounded app icon itself)
const ICON_EXPORT = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v10"/><path d="M8 7l4-4 4 4"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>`;

const ICON_IMPORT = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v10"/><path d="M8 9l4 4 4-4"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>`;

const ICON_PERMISSIONS = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 11V7a4 4 0 0 1 7.5-2"/><rect x="5" y="11" width="9" height="8" rx="1.5"/><path d="M7 15l1.5 1.5L11 14"/></svg>`;

const ICON_HELP = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7v.5"/><path d="M12 17h.01"/></svg>`;

const ICON_MANUAL = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5V5.5A2.5 2.5 0 0 1 6.5 3H12v18H6.5a2.5 2.5 0 0 0-2.5 2.5"/><path d="M12 3h5.5A2.5 2.5 0 0 1 20 5.5v14a2.5 2.5 0 0 0-2.5-2.5H12"/></svg>`;

const ICON_FAQ = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.35 0-2.62-.32-3.75-.9L3 20l1.1-4.4A8.5 8.5 0 1 1 21 11.5z"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7v.3"/><path d="M12 16h.01"/></svg>`;

const ICON_UNDO = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a5 5 0 0 1 0 10H11"/></svg>`;

const ICON_REDO = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14l5-5-5-5"/><path d="M20 9H10a5 5 0 0 0 0 10h3"/></svg>`;

const ICON_RENAME = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>`;

const ICON_TEMPLATE = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3h8l5 5v13H3V3h5z"/><path d="M8 3v5h8"/><path d="M8 13h8"/><path d="M8 17h5"/></svg>`;

const ICON_PROTECTED = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-3z"/><path d="M9.5 12.5l1.5 1.5 3.5-3.5"/></svg>`;

const ICON_UNPROTECTED = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-3z"/></svg>`;

const ICON_BACK = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>`;

// ── Update Prompt / Reload Coordination ──────────────────────────────────────
// Both the service worker's own lifecycle events and the version.json check
// below can independently notice the same deploy — this flag makes sure only
// one confirm() dialog is ever shown per detected update. Declining resets it
// so a later check (next visibility change, etc.) can prompt again.
let updatePromptShown = false;

function promptForReload(newVersion, waitingWorker) {
  if (updatePromptShown) return;
  updatePromptShown = true;
  const label = newVersion ? ` (${newVersion})` : '';
  if (confirm(`A new version of BudgetApp${label} is available. Refresh now?`)) {
    reloadWithLatestServiceWorker(waitingWorker);
  } else {
    updatePromptShown = false;
  }
}

// Reloading immediately after confirm() used to race the service worker:
// sw.js called skipWaiting()/clients.claim() on its own schedule, so the new
// worker could take control of the still-open page — serving a mix of old
// in-memory JS and new cached assets — before the user had even clicked
// "Refresh". This instead tells the (already-installed) worker to activate
// only now, and waits for it to actually take control before reloading, so
// the reload always lands on a fully-consistent new version.
function reloadWithLatestServiceWorker(waitingWorker) {
  const proceed = (worker) => {
    if (!worker) { window.location.reload(); return; }
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
    worker.postMessage('SKIP_WAITING');
    // Fallback in case controllerchange never fires for some reason
    setTimeout(() => { if (!reloaded) { reloaded = true; window.location.reload(); } }, 2000);
  };

  if (waitingWorker) { proceed(waitingWorker); return; }
  navigator.serviceWorker.getRegistration()
    .then(reg => proceed(reg && reg.waiting))
    .catch(() => window.location.reload());
}

// ── Service Worker ──────────────────────────────────────────────────────────
// updateViaCache: 'none' prevents the browser's HTTP cache from serving a stale
// sw.js file, which was previously blocking update detection on iOS Safari
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
    reg.addEventListener('updatefound', () => {
      // reg.installing can already be null here if the worker advanced to
      // 'waiting' before this handler ran — fall back to reg.waiting so the
      // listener below isn't attached to a null reference
      const nw = reg.installing || reg.waiting;
      if (!nw) return;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          promptForReload(null, nw);
        }
      });
    });
    // Force an immediate update check right after registration
    reg.update();
  });
}

// Re-check for updates every time the app becomes visible again
// (e.g. switching back from another app on iPhone)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    navigator.serviceWorker.getRegistration().then(reg => { if (reg) reg.update(); });
    checkForAppUpdate();
    alignActiveMonthTabDeferred();
  }
});

// ── Explicit App Version Check ──────────────────────────────────────────────
// Uses version.json as the single remote-version source of truth, compared
// against the APP_VERSION baked into this running bundle (see Config, top of
// file). This works alongside the service worker, but does not rely solely
// on service worker lifecycle events for update detection on iOS.
function fetchVersionInfo() {
  return fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' })
    .then(res => {
      if (!res.ok) throw new Error('Failed to fetch version.json');
      return res.json();
    });
}

function checkForAppUpdate() {
  return fetchVersionInfo()
    .then(info => {
      if (!info || !info.version) return;
      if (info.version !== APP_VERSION) {
        promptForReload(info.version);
      }
    })
    .catch(() => {
      // Silent fail — app should continue working even if version check fails
    });
}

// ── Persistent Storage ──────────────────────────────────────────────────────
// Requests that the browser NOT automatically clear this site's storage
// under low-disk-space conditions. Does not protect against manual clearing.
function requestPersistentStorage() {
  if (navigator.storage && navigator.storage.persist) {
    return navigator.storage.persist();
  }
  return Promise.resolve(false);
}

function checkPersistentStorage() {
  if (navigator.storage && navigator.storage.persisted) {
    return navigator.storage.persisted();
  }
  return Promise.resolve(false);
}

// Silently request on every load — cheap no-op if already granted
requestPersistentStorage();

// ── Storage Helpers ─────────────────────────────────────────────────────────
function storageKey(year, month)    { return `budget_${year}_${month}`; }
function protectionKey(year, month) { return `protected_${year}_${month}`; }

function isProtected(year, month) {
  return localStorage.getItem(protectionKey(year, month)) === 'true';
}

function setProtected(year, month, value) {
  return safeSetItem(protectionKey(year, month), value ? 'true' : 'false');
}

function isPastMonth(year, month) {
  const now = new Date();
  return year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth());
}

// Returns the next unused palette colour, cycling once all are taken
function getNextColour(data) {
  const usedColours = data.map(c => c.colour);
  for (let i = 0; i < PALETTE.length; i++) {
    if (!usedColours.includes(PALETTE[i])) return PALETTE[i];
  }
  return PALETTE[data.length % PALETTE.length];
}

// Identifies which localStorage keys belong to budget data (used by
// undo/redo snapshotting and export/import so we never touch unrelated keys).
// Note: lastViewedMonth is intentionally NOT matched here — it's a UI
// preference, not budget data, so it's excluded from undo/redo and exports.
function isRelevantKey(key) {
  return key.startsWith('budget_') || key.startsWith('protected_');
}

function safeParseJSON(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

// Wraps localStorage.setItem so a full/unavailable storage quota can never
// throw mid-mutation and silently drop the caller's change. Returns false
// (instead of throwing) so callers can decide how to inform the user.
function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    console.error(`BudgetApp: failed to write "${key}" to localStorage`, err);
    return false;
  }
}

// Only accepts strict 6-digit hex colours. Category colour is interpolated
// directly into inline style/onclick attributes when rendering, so imported
// data must be constrained to a safe shape rather than merely HTML-escaped.
function sanitizeColour(colour) {
  return typeof colour === 'string' && /^#[0-9a-fA-F]{6}$/.test(colour) ? colour : null;
}

// Looks up PALETTE_COLOUR_MIGRATIONS case-insensitively — stored/imported
// data could have any casing even though the app itself always writes
// uppercase hex — falling back to the original value unchanged if it isn't
// one of the old colours being migrated.
function migrateOldPaletteColour(colour) {
  if (typeof colour !== 'string') return colour;
  return PALETTE_COLOUR_MIGRATIONS[colour.toUpperCase()] || colour;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Last Viewed Month Persistence ────────────────────────────────────────────
// Remembers whichever month/year tab was last open so that re-opening the
// app (e.g. from the iPhone home screen after being minimized) returns the
// user to where they left off, rather than resetting to today's month.
function saveLastViewedMonth(year, month) {
  safeSetItem('lastViewedMonth', JSON.stringify({ year, month }));
}

function loadLastViewedMonth() {
  const raw = localStorage.getItem('lastViewedMonth');
  return safeParseJSON(raw, null);
}

// ── Undo / Redo ──────────────────────────────────────────────────────────────
// Snapshot-based undo system — captures the entire relevant localStorage state
// before every mutating action, rather than tracking diffs. Simpler and more
// reliable at the cost of slightly larger stored snapshots.

function getUndoStack() {
  const raw = localStorage.getItem('__undoStack');
  return safeParseJSON(raw, []);
}
function setUndoStack(stack) {
  return safeSetItem('__undoStack', JSON.stringify(stack));
}
function getRedoStack() {
  const raw = localStorage.getItem('__redoStack');
  return safeParseJSON(raw, []);
}
function setRedoStack(stack) {
  return safeSetItem('__redoStack', JSON.stringify(stack));
}

// Captures every budget/protection key currently in localStorage
function snapshotState() {
  const snap = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (isRelevantKey(key)) snap[key] = localStorage.getItem(key);
  }
  return snap;
}

// Wipes all current budget/protection keys and replaces them with a snapshot.
// Returns false if any key failed to write, so the caller can warn the user
// that the restored state may be incomplete rather than assuming success.
function restoreState(snapshot) {
  const toRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (isRelevantKey(key)) toRemove.push(key);
  }
  toRemove.forEach(k => localStorage.removeItem(k));
  let allOk = true;
  Object.keys(snapshot).forEach(k => { if (!safeSetItem(k, snapshot[k])) allOk = false; });
  return allOk;
}

// Must be called BEFORE a mutation happens — records the state as it was
// immediately prior to the action about to be performed.
// Returns false if the snapshot couldn't be stored (e.g. storage quota full),
// so the caller can still apply the mutation but warn that it can't be undone.
function recordUndo(description) {
  const stack = getUndoStack();
  stack.push({ desc: description, snapshot: snapshotState() });
  while (stack.length > UNDO_LIMIT) stack.shift(); // cap at UNDO_LIMIT, drop oldest
  const recorded = setUndoStack(stack);
  setRedoStack([]); // any new action invalidates the redo stack (standard behaviour)
  return recorded;
}

// Wraps a mutating function with automatic undo recording. The mutation
// always runs even if the undo snapshot couldn't be saved — losing undo
// history is far less harmful than silently dropping the user's edit.
//
// Undo/redo is a single stack shared across every month, so the action an
// undo/redo actually reverts can belong to a different month than whichever
// one happens to be on screen when you press it — the affected month is
// appended to the toast so that's never ambiguous. Pass { scoped: false }
// for actions that aren't about "the currently viewed month" at all (e.g.
// importing a full multi-year history), where naming just one month would
// be misleading rather than clarifying.
function withUndo(description, mutateFn, { scoped = true } = {}) {
  const fullDescription = scoped ? `${description} (${MONTHS[currentMonth]} ${currentYear})` : description;
  const recorded = recordUndo(fullDescription);
  mutateFn();
  if (!recorded) {
    showToast('Your change was saved, but device storage is too full to keep an Undo record for it. Export a backup soon and consider freeing up storage.');
  }
}

function undoLastAction() {
  const undoStack = getUndoStack();
  if (undoStack.length === 0) { closeSheet(); showToast('Nothing to undo.'); return; }
  const entry = undoStack.pop();
  setUndoStack(undoStack);

  // Push current state onto redo stack before restoring the older snapshot
  const redoStack = getRedoStack();
  redoStack.push({ desc: entry.desc, snapshot: snapshotState() });
  while (redoStack.length > UNDO_LIMIT) redoStack.shift();
  setRedoStack(redoStack);

  const restored = restoreState(entry.snapshot);
  closeSheet();
  renderMonthTabs();
  renderBudget();
  showToast(restored ? `Undone: ${entry.desc}` : `Undone: ${entry.desc} (storage is full — restore may be incomplete)`);
}

function redoLastAction() {
  const redoStack = getRedoStack();
  if (redoStack.length === 0) { closeSheet(); showToast('Nothing to redo.'); return; }
  const entry = redoStack.pop();
  setRedoStack(redoStack);

  // Push current state back onto undo stack before reapplying
  const undoStack = getUndoStack();
  undoStack.push({ desc: entry.desc, snapshot: snapshotState() });
  while (undoStack.length > UNDO_LIMIT) undoStack.shift();
  setUndoStack(undoStack);

  const restored = restoreState(entry.snapshot);
  closeSheet();
  renderMonthTabs();
  renderBudget();
  showToast(restored ? `Redone: ${entry.desc}` : `Redone: ${entry.desc} (storage is full — restore may be incomplete)`);
}

// ── Data ────────────────────────────────────────────────────────────────────
function normalizeRow(row) {
  return {
    expense: row.expense ?? '',
    cost: row.cost ?? '',
    paid: row.paid ?? false,
    mode: row.mode ?? 'fully-paid',
    runningTotal: row.runningTotal ?? ''
  };
}

function loadData(year, month) {
  const raw = localStorage.getItem(storageKey(year, month));
  if (raw) {
    const parsed = safeParseJSON(raw, null);
    if (!Array.isArray(parsed)) {
      return DEFAULT_CATEGORIES.map(c => ({ ...c, rows: c.rows.map(r => ({ ...r })) }));
    }

    // Enforce isIncome strictly by index 0 — protects against legacy saved
    // data (pre-v4.0) that never had this flag, which caused Income to be
    // incorrectly treated as an expense
    return parsed.map((cat, idx) => {
      const fallbackCat = DEFAULT_CATEGORIES[idx] || DEFAULT_CATEGORIES[DEFAULT_CATEGORIES.length - 1];
      const normalizedCat = cat && typeof cat === 'object' ? cat : {};
      return {
        ...fallbackCat,
        ...normalizedCat,
        name: typeof normalizedCat.name === 'string' && normalizedCat.name.trim() ? normalizedCat.name : fallbackCat.name,
        isIncome: idx === 0,
        // sanitizeColour rejects anything that isn't a plain 6-digit hex value —
        // colour is later interpolated into inline style/onclick attributes, so
        // imported/legacy data can't be used to break out of those attributes.
        // migrateOldPaletteColour runs first so categories saved before the
        // contrast fix pick up their corrected colour automatically.
        colour: sanitizeColour(migrateOldPaletteColour(normalizedCat.colour)) || (idx === 0 ? INCOME_COLOUR : PALETTE[idx % PALETTE.length]),
        rows: Array.isArray(normalizedCat.rows) ? normalizedCat.rows.map(normalizeRow) : fallbackCat.rows.map(r => ({ ...r }))
      };
    });
  }
  return DEFAULT_CATEGORIES.map(c => ({ ...c, rows: c.rows.map(r => ({ ...r })) }));
}

// Returns false if the write failed (e.g. storage quota full). Callers still
// re-render after this — renderBudget() re-reads from localStorage, so on
// failure the UI correctly reverts to the last value that was actually
// persisted rather than showing an edit that was never saved.
function saveData(year, month, data) {
  const ok = safeSetItem(storageKey(year, month), JSON.stringify(data));
  if (!ok) {
    showToast('Could not save your change — device storage is full. Export a backup and free up storage, then try again.');
    renderMonthTabs();
    return false;
  }
  // Any manual save automatically protects the month from being
  // overwritten by Set as Template propagation
  setProtected(year, month, true);
  renderMonthTabs();
  return true;
}

// ── Template Propagation ─────────────────────────────────────────────────────
function setAsTemplate() {
  if (!confirm(`Copy ${MONTHS[currentMonth]} ${currentYear} to all unprotected following months?`)) return;
  // Month/year is appended automatically by withUndo() now — no need to
  // repeat it here
  withUndo('Set as Template', () => {
    const data = loadData(currentYear, currentMonth);
    const templatedRows = data.map(cat => ({
      ...cat,
      rows: cat.rows.map(r => ({
        expense: r.expense,
        cost: r.cost,
        paid: false,
        mode: r.mode ?? 'fully-paid',
        runningTotal: ''
      }))
    }));
    let count = 0;
    let failCount = 0;
    let skippedCount = 0;

    // Remaining months in the current year
    for (let m = currentMonth + 1; m < 12; m++) {
      if (!isProtected(currentYear, m)) {
        if (safeSetItem(storageKey(currentYear, m), JSON.stringify(templatedRows))) count++;
        else failCount++;
      } else {
        skippedCount++;
      }
    }
    // All months in all future years — enables multi-year roll forward
    for (let y = currentYear + 1; y <= CURRENT_YEAR + 4; y++) {
      for (let m = 0; m < 12; m++) {
        if (!isProtected(y, m)) {
          if (safeSetItem(storageKey(y, m), JSON.stringify(templatedRows))) count++;
          else failCount++;
        } else {
          skippedCount++;
        }
      }
    }
    showToast(
      `Done! ${count} month${count !== 1 ? 's' : ''} updated.` +
      (skippedCount > 0 ? ` ${skippedCount} protected month${skippedCount !== 1 ? 's' : ''} skipped.` : '') +
      (failCount > 0 ? ` ${failCount} month${failCount !== 1 ? 's' : ''} could not be saved — device storage is full.` : '')
    );
    renderBudget();
  });
}

function toggleProtection() {
  const willProtect = !isProtected(currentYear, currentMonth);
  withUndo(willProtect ? 'Protected' : 'Unprotected', () => {
    setProtected(currentYear, currentMonth, willProtect);
    renderMonthTabs();
  });
  openMainMenu();
  // setTimeout(() => closeSheet(), 220); // disabled to prevent automatic close on protected toggle
}

// ── Bottom Sheet (shared popup component) ────────────────────────────────────
function openSheet(html) {
  document.getElementById('bottomSheet').innerHTML = html;
  document.getElementById('bottomSheet').classList.add('open');
  document.getElementById('sheetOverlay').classList.add('open');
}

function closeSheet() {
  document.getElementById('bottomSheet').classList.remove('open');
  document.getElementById('sheetOverlay').classList.remove('open');
}

// Lets the bottom sheet (now marked role="dialog") be dismissed with Escape,
// same as tapping the overlay — only acts while a sheet is actually open
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('bottomSheet').classList.contains('open')) {
    closeSheet();
  }
});

// ── Toast ────────────────────────────────────────────────────────────────────
// Replaces the native alert dialog for routine feedback (undo/redo, import
// results, save warnings) — a blocking dialog on every single undo/redo was
// the most repeated friction point in the app. Destructive confirmations
// and text entry still use the native confirm/prompt dialogs for now.
let toastTimer = null;

function showToast(message) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

// ── Main Menu ────────────────────────────────────────────────────────────────
// Triggered by tapping the app name/icon in the header
function openMainMenu() {
  const undoCount = getUndoStack().length;
  const redoCount = getRedoStack().length;
  const protectedNow = isProtected(currentYear, currentMonth);

  const html = `
    <div class="sheet-header">
      <button class="sheet-back-btn" onclick="closeSheet()">
        <span class="sheet-option-icon">${ICON_BACK}</span>
      </button>
      <div class="sheet-title-inline">BudgetApp Menu</div>
      <div class="sheet-back-placeholder"></div>
    </div>

    <button class="sheet-option" onclick="openExportMenu()">
      <span class="sheet-option-icon">${ICON_EXPORT}</span> Export
    </button>

    <button class="sheet-option" onclick="openImportMenu()">
      <span class="sheet-option-icon">${ICON_IMPORT}</span> Import
    </button>

    <button class="sheet-option" onclick="setAsTemplate();">
      <span class="sheet-option-icon">${ICON_TEMPLATE}</span> Set Current Month as Template
    </button>

    <button class="sheet-option" onclick="toggleProtection();">
      <span class="sheet-option-icon">${protectedNow ? ICON_PROTECTED : ICON_UNPROTECTED}</span>
      Current Month ${protectedNow ? 'Protected' : 'Unprotected'}
    </button>

    <button class="sheet-option ${undoCount === 0 ? 'disabled' : ''}"
      onclick="${undoCount === 0 ? '' : 'undoLastAction()'}">
      <span class="sheet-option-icon">${ICON_UNDO}</span> Undo
      <span class="sheet-option-sub">${undoCount > 0 ? undoCount : ''}</span>
    </button>

    <button class="sheet-option ${redoCount === 0 ? 'disabled' : ''}"
      onclick="${redoCount === 0 ? '' : 'redoLastAction()'}">
      <span class="sheet-option-icon">${ICON_REDO}</span> Redo
      <span class="sheet-option-sub">${redoCount > 0 ? redoCount : ''}</span>
    </button>

    <button class="sheet-option" onclick="openPermissionsMenu()">
      <span class="sheet-option-icon">${ICON_PERMISSIONS}</span> App Permissions
    </button>

    <button class="sheet-option" onclick="openHelpMenu()">
      <span class="sheet-option-icon">${ICON_HELP}</span> Help
    </button>

    <div class="sheet-version-line">Version ${APP_VERSION}</div>
  `;
  openSheet(html);
}

// ── Export Menu ──────────────────────────────────────────────────────────────
function openExportMenu() {
  const html = `
    <div class="sheet-header">
      <button class="sheet-back-btn" onclick="openMainMenu()">
        <span class="sheet-option-icon">${ICON_BACK}</span>
      </button>
      <div class="sheet-title-inline">Export</div>
      <div class="sheet-back-placeholder"></div>
    </div>

    <button class="sheet-option" onclick="exportCurrentMonth()">
      <span class="sheet-option-icon">${ICON_EXPORT}</span> Export Current Month As Template
    </button>

    <button class="sheet-option" onclick="exportFullHistory()">
      <span class="sheet-option-icon">${ICON_EXPORT}</span> Export Entire Budget History
    </button>

    <div class="sheet-version-line">Version ${APP_VERSION}</div>
  `;
  openSheet(html);
}

// Triggers a browser file download containing the given object as JSON
function downloadJSON(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportCurrentMonth() {
  const data = loadData(currentYear, currentMonth);
  const payload = {
    version: 1,
    type: 'month',
    year: currentYear,
    month: currentMonth,
    protected: isProtected(currentYear, currentMonth),
    data
  };
  const monthStr = String(currentMonth + 1).padStart(2, '0');
  downloadJSON(`budget-template-${currentYear}-${monthStr}.json`, payload);
  closeSheet();
}

// Exports every saved month + protection flag across all years.
// Undo/redo history is intentionally excluded from history exports.
function exportFullHistory() {
  const entries = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!isRelevantKey(key)) continue;
    const rawValue = localStorage.getItem(key);
    const parsedValue = safeParseJSON(rawValue, null);
    if (parsedValue !== null) entries[key] = parsedValue;
  }
  const payload = {
    version: 1,
    type: 'history',
    exportedAt: new Date().toISOString(),
    entries
  };
  const stamp = new Date().toISOString().slice(0, 10);
  downloadJSON(`budget-history-full-${stamp}.json`, payload);
  closeSheet();
}

// ── Import Menu ──────────────────────────────────────────────────────────────
let pendingImportType = null; // tracks which import flow triggered the file picker

function openImportMenu() {
  const html = `
    <div class="sheet-header">
      <button class="sheet-back-btn" onclick="openMainMenu()">
        <span class="sheet-option-icon">${ICON_BACK}</span>
      </button>
      <div class="sheet-title-inline">Import</div>
      <div class="sheet-back-placeholder"></div>
    </div>

    <button class="sheet-option" onclick="triggerImport('month')">
      <span class="sheet-option-icon">${ICON_IMPORT}</span> Import a Single Month Template
    </button>

    <button class="sheet-option" onclick="triggerImport('history')">
      <span class="sheet-option-icon">${ICON_IMPORT}</span> Import Budget History
    </button>

    <div class="sheet-version-line">Version ${APP_VERSION}</div>
  `;
  openSheet(html);
}

function triggerImport(type) {
  pendingImportType = type;
  closeSheet();
  document.getElementById('importFileInput').click();
}

// Handles the file selected via the hidden <input type="file">
function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);

      if (pendingImportType === 'month') {
        if (parsed.type !== 'month' || !parsed.data) {
          showToast('This file is not a valid single month template.');
          return;
        }
        if (!confirm(`Import this template into ${MONTHS[currentMonth]} ${currentYear}? This will overwrite existing data for this month.`)) return;

        withUndo('Imported template', () => {
          saveData(currentYear, currentMonth, parsed.data);
          if (typeof parsed.protected === 'boolean') setProtected(currentYear, currentMonth, parsed.protected);
          renderBudget();
        });
        showToast('Import complete.');
      }

      if (pendingImportType === 'history') {
        if (parsed.type !== 'history' || !parsed.entries) {
          showToast('This file is not a valid budget history export.');
          return;
        }
        // Only budget_*/protected_* keys are ever imported — never trust the
        // file to write arbitrary localStorage keys (e.g. __undoStack, or an
        // unrelated key from a tampered/foreign export)
        const importableKeys = Object.keys(parsed.entries).filter(isRelevantKey);
        const skippedCount = Object.keys(parsed.entries).length - importableKeys.length;
        if (!confirm(`Import full history? This will overwrite ${importableKeys.length} saved month(s)/setting(s).`)) return;

        let failCount = 0;
        // scoped:false — this can touch months across every year, so
        // naming just the currently-viewed one would be misleading
        withUndo('Imported full budget history', () => {
          importableKeys.forEach(key => {
            if (!safeSetItem(key, JSON.stringify(parsed.entries[key]))) failCount++;
          });
          renderMonthTabs();
          renderBudget();
        }, { scoped: false });
        showToast(
          'Import complete.' +
          (skippedCount > 0 ? ` ${skippedCount} unrecognised entr${skippedCount !== 1 ? 'ies' : 'y'} in the file were skipped.` : '') +
          (failCount > 0 ? ` ${failCount} entr${failCount !== 1 ? 'ies' : 'y'} could not be saved — device storage is full.` : '')
        );
      }
    } catch (err) {
      showToast('Could not read this file. Please make sure it is a valid BudgetApp export.');
    } finally {
      // Always reset, including on early returns above, so re-selecting the
      // same file after a cancelled/failed import still fires a change event
      event.target.value = '';
      pendingImportType = null;
    }
  };
  reader.onerror = () => {
    showToast('Could not read this file from disk.');
    event.target.value = '';
    pendingImportType = null;
  };
  reader.readAsText(file);
}

// ── Permissions Menu ─────────────────────────────────────────────────────────
function openPermissionsMenu() {
  const html = `
    <div class="sheet-header">
      <button class="sheet-back-btn" onclick="openMainMenu()">
        <span class="sheet-option-icon">${ICON_BACK}</span>
      </button>
      <div class="sheet-title-inline">App Permissions</div>
      <div class="sheet-back-placeholder"></div>
    </div>

    <div id="permissionStatusRow" class="permission-status">
      <span>Persistent Storage</span>
      <span class="permission-badge">Checking...</span>
    </div>

    <div class="sheet-version-line">Version ${APP_VERSION}</div>
  `;
  openSheet(html);

  // Async status check — updates the row once resolved
  checkPersistentStorage().then(granted => {
    const row = document.getElementById('permissionStatusRow');
    if (!row) return;
    if (granted) {
      row.innerHTML = `
        <span>Persistent Storage</span>
        <span class="permission-badge granted">Granted</span>
      `;
    } else {
      row.innerHTML = `
        <span>Persistent Storage</span>
        <span style="display:flex; align-items:center; gap:8px;">
          <span class="permission-badge denied">Not Granted</span>
          <button class="permission-request-btn" onclick="requestPermissionFromMenu()">Request</button>
        </span>
      `;
    }
  });
}

function requestPermissionFromMenu() {
  requestPersistentStorage().then(() => {
    openPermissionsMenu(); // refresh the menu to reflect new status
  });
}

// ── Help Menu ────────────────────────────────────────────────────────────────
function openHelpMenu() {
  const html = `
    <div class="sheet-header">
      <button class="sheet-back-btn" onclick="openMainMenu()">
        <span class="sheet-option-icon">${ICON_BACK}</span>
      </button>
      <div class="sheet-title-inline">Help</div>
      <div class="sheet-back-placeholder"></div>
    </div>

    <button class="sheet-option" onclick="openUserManual()">
      <span class="sheet-option-icon">${ICON_MANUAL}</span> User Manual
    </button>

    <button class="sheet-option" onclick="openFAQ()">
      <span class="sheet-option-icon">${ICON_FAQ}</span> FAQ
    </button>

    <div class="sheet-version-line">Version ${APP_VERSION}</div>
  `;
  openSheet(html);
}

function openUserManual() {
  const html = `
    <div class="sheet-header">
      <button class="sheet-back-btn" onclick="openHelpMenu()">
        <span class="sheet-option-icon">${ICON_BACK}</span>
      </button>
      <div class="sheet-title-inline">User Manual</div>
      <div class="sheet-back-placeholder"></div>
    </div>

    <div class="help-heading">Getting started</div>
    <div class="help-text">Every month has its own budget. Switch between months using the tabs, and between years using the year selector. Changes save automatically as soon as you leave a field — there is no separate save step.</div>

    <div class="help-heading">Categories</div>
    <div class="help-text">Your budget is grouped into categories, like Home, Food or Fuel. Income sits fixed at the top and tracks money coming in rather than money going out. Tap a category's ⋮ button to rename it, change its colour, reorder it, or delete it. Income can only have its colour changed, since it always stays first and can't be moved, renamed or deleted.</div>

    <div class="help-heading">Rows</div>
    <div class="help-text">Each category holds rows for individual expenses (or, in Income, sources of income). Use "+ Add row" to add one, and a row's ⋮ button to remove or reorder it, or switch how it's tracked.</div>

    <div class="help-heading">Fully Paid vs Running Total rows</div>
    <div class="help-text">By default a row is "Fully Paid" — tick its checkbox once it's been paid. Switch a row to "Running Total" when a budgeted expense gets paid off in parts rather than all at once — instead of a checkbox you get a running balance, which you can edit directly or top up using the row's "Add to Total" option as each part payment goes through.</div>

    <div class="help-heading">The summary bar</div>
    <div class="help-text">Income is the total of everything in the Income category. Total Expenses is the sum of every other category's costs. Budgeted Balance is Income minus Total Expenses — what you planned. In Account reflects what's actually happened so far: costs from ticked Fully Paid rows, plus current Running Total balances.</div>

    <div class="help-heading">Undo &amp; Redo</div>
    <div class="help-text">Most changes can be undone from the main menu, for up to the last 10 actions. Redo brings an undone change back, as long as you haven't made a new change since.</div>

    <div class="help-heading">Set Current Month as Template</div>
    <div class="help-text">Copies the month you're viewing forward to every later month across the next few years — amounts and row names carry over, but Paid ticks and Running Totals reset. Any month you've protected is always skipped.</div>

    <div class="help-heading">Protect Month</div>
    <div class="help-text">Locking a month (shown with a padlock on its tab) stops "Set as Template" from overwriting it — use this once a month is finalised the way you want it.</div>

    <div class="help-heading">Export &amp; Import</div>
    <div class="help-text">Export a single month as a reusable template, or your entire budget history as a backup, and import either kind of file back in. Useful for moving to a new device or restoring after clearing app data.</div>

    <div class="sheet-version-line">Version ${APP_VERSION}</div>
  `;
  openSheet(html);
}

function openFAQ() {
  const faqs = [
    ["Why can't I rename, reorder or delete the Income category?", "Income always stays first so the app can reliably tell it apart from expense categories. You can still change its colour."],
    ["What happens if my device storage is full?", "The app tells you via a message instead of silently losing your change, and an Undo record may not be kept for it. Export a backup and free up some space."],
    ["What's the difference between Fully Paid and Running Total rows?", "Fully Paid is a simple paid/not-paid checkbox for a one-off cost. Running Total is for an expense you're paying off in parts rather than all at once — it tracks a running balance instead of a single paid/unpaid state."],
    ["Does Set as Template change past months?", "No — it only copies forward from the month you're viewing to later months, and never touches months you've locked with Protect Month."],
    ["How many undos do I get?", "The last 10 actions. Once you go past that, the oldest ones drop off."],
    ["Will my data sync between devices?", "Not yet — everything is stored locally on your device. Use Export and Import to move your data to another device."]
  ];

  const html = `
    <div class="sheet-header">
      <button class="sheet-back-btn" onclick="openHelpMenu()">
        <span class="sheet-option-icon">${ICON_BACK}</span>
      </button>
      <div class="sheet-title-inline">FAQ</div>
      <div class="sheet-back-placeholder"></div>
    </div>

    ${faqs.map(([q, a]) => `
    <div class="faq-item">
      <div class="faq-question">${q}</div>
      <div class="faq-answer">${a}</div>
    </div>`).join('')}

    <div class="sheet-version-line">Version ${APP_VERSION}</div>
  `;
  openSheet(html);
}

// ── Category Management Menu ─────────────────────────────────────────────────
function openCategoryMenu(catIdx) {
  const data    = loadData(currentYear, currentMonth);
  const cat     = data[catIdx];
  const isInc   = cat.isIncome;
  // Move Up is irrelevant for Income and for any category already at index 1
  // (directly below Income) — prevents anything from landing on index 0
  const hideUp   = isInc || catIdx <= 1;
  const hideDown = isInc || catIdx === data.length - 1;

  // Income can never be renamed, moved, or deleted — those options are
  // omitted entirely rather than shown disabled (a disabled/grey button is
  // hard to read in dark mode, and hiding also keeps the menu shorter)
  const html = `
    <div class="sheet-header">
      <button class="sheet-back-btn" onclick="closeSheet()">
        <span class="sheet-option-icon">${ICON_BACK}</span>
      </button>
      <div class="sheet-title-inline">${escapeHtml(cat.name)}</div>
      <div class="sheet-back-placeholder"></div>
    </div>

    ${hideUp ? '' : `
    <button class="sheet-option" onclick="sheetMove(${catIdx},-1)">
      <span class="sheet-option-icon">▲</span> Move Up
    </button>`}

    ${hideDown ? '' : `
    <button class="sheet-option" onclick="sheetMove(${catIdx},1)">
      <span class="sheet-option-icon">▼</span> Move Down
    </button>`}

    ${isInc ? '' : `
    <button class="sheet-option" onclick="sheetRename(${catIdx})">
      <span class="sheet-option-icon">${ICON_RENAME}</span> Rename
    </button>`}

    <button class="sheet-option" onclick="sheetColour(${catIdx})">
      <span class="sheet-option-icon">🎨</span> Change Colour
    </button>

    ${isInc ? '' : `
    <button class="sheet-option destructive" onclick="sheetDelete(${catIdx})">
      <span class="sheet-option-icon">🗑️</span> Delete
    </button>`}

    <div class="sheet-version-line">Version ${APP_VERSION}</div>
  `;
  openSheet(html);
}

function sheetRename(catIdx) {
  const data = loadData(currentYear, currentMonth);
  const oldName = data[catIdx].name;
  const name = prompt('Rename category:', oldName);
  if (name && name.trim()) {
    withUndo(`Renamed "${oldName}" to "${name.trim()}"`, () => {
      const d = loadData(currentYear, currentMonth);
      d[catIdx].name = name.trim();
      saveData(currentYear, currentMonth, d);
      renderBudget();
    });
  }
  closeSheet();
}

function sheetColour(catIdx) {
  const data    = loadData(currentYear, currentMonth);
  const current = data[catIdx].colour;

  const swatches = PALETTE.map(c => `
    <div class="colour-swatch ${c === current ? 'selected' : ''}"
      style="background:${c}"
      onclick="applyColour(${catIdx},'${c}')">
    </div>
  `).join('');

  const html = `
    <div class="sheet-header">
      <button class="sheet-back-btn" onclick="openCategoryMenu(${catIdx})">
        <span class="sheet-option-icon">${ICON_BACK}</span>
      </button>
      <div class="sheet-title-inline">Choose Colour</div>
      <div class="sheet-back-placeholder"></div>
    </div>

    <div class="colour-grid">${swatches}</div>

    <div class="sheet-version-line">Version ${APP_VERSION}</div>
  `;
  openSheet(html);
}

function applyColour(catIdx, colour) {
  const data = loadData(currentYear, currentMonth);
  const name = data[catIdx].name;
  withUndo(`Changed colour of "${name}"`, () => {
    const d = loadData(currentYear, currentMonth);
    d[catIdx].colour = colour;
    saveData(currentYear, currentMonth, d);
    renderBudget();
  });
  closeSheet();
}

function sheetMove(catIdx, direction) {
  const data   = loadData(currentYear, currentMonth);
  const newIdx = catIdx + direction;

  // Bounds check
  if (newIdx < 0 || newIdx >= data.length) { closeSheet(); return; }
  // Income can never move
  if (data[catIdx].isIncome) { closeSheet(); return; }
  // Hard block — no category may ever occupy index 0 (Income's permanent slot)
  if (newIdx === 0) { closeSheet(); return; }

  const name = data[catIdx].name;
  withUndo(`Moved "${name}" ${direction < 0 ? 'up' : 'down'}`, () => {
    const d = loadData(currentYear, currentMonth);
    [d[catIdx], d[newIdx]] = [d[newIdx], d[catIdx]];
    // Final safety net — re-enforce isIncome strictly by index after any swap
    d.forEach((cat, idx) => { cat.isIncome = idx === 0; });
    saveData(currentYear, currentMonth, d);
    renderBudget();
  });
  closeSheet();
}

function sheetDelete(catIdx) {
  const data = loadData(currentYear, currentMonth);
  if (data[catIdx].isIncome) { closeSheet(); return; }
  const name = data[catIdx].name;
  if (!confirm(`Delete "${name}"? You can restore it using Undo.`)) { closeSheet(); return; }

  withUndo(`Deleted category "${name}"`, () => {
    const d = loadData(currentYear, currentMonth);
    d.splice(catIdx, 1);
    saveData(currentYear, currentMonth, d);
    renderBudget();
  });
  closeSheet();
}

function addCategory() {
  const name = prompt('New category name:');
  if (!name || !name.trim()) return;
  withUndo(`Added category "${name.trim()}"`, () => {
    const data   = loadData(currentYear, currentMonth);
    const colour = getNextColour(data);
    data.push({ name: name.trim(), colour, isIncome: false, rows: [{ expense: '', cost: '', paid: false, mode: 'fully-paid', runningTotal: '' }] });
    saveData(currentYear, currentMonth, data);
    renderBudget();
  });
}

// ── Row Menu ─────────────────────────────────────────────────────────────────
// Replaces the inline remove-row button with a vertical ellipsis menu.
// Each row can switch between:
// - fully-paid: checkbox in the 4th column
// - running-total: numeric input in the 4th column
function openRowMenu(catIdx, rowIdx) {
  const data = loadData(currentYear, currentMonth);
  const row = data[catIdx].rows[rowIdx];
  const category = data[catIdx];
  const mode = row.mode ?? 'fully-paid';

  const hideUp = rowIdx === 0;
  const hideDown = rowIdx === data[catIdx].rows.length - 1;

  const switchLabel = mode === 'running-total'
    ? 'Switch Row to Fully Paid'
    : 'Switch Row to Running Total';

  const html = `
    <div class="sheet-header">
      <button class="sheet-back-btn" onclick="closeSheet()">
        <span class="sheet-option-icon">${ICON_BACK}</span>
      </button>
      <div class="sheet-title-inline">Row Options</div>
      <div class="sheet-back-placeholder"></div>
    </div>

    <button class="sheet-option" onclick="removeRow(${catIdx},${rowIdx})">
      <span class="sheet-option-icon">🗑️</span> Remove Row
    </button>

    ${category.isIncome ? '' : `
    <button class="sheet-option" onclick="switchRowMode(${catIdx},${rowIdx})">
      <span class="sheet-option-icon">⇄</span> ${switchLabel}
    </button>`}

    ${mode === 'running-total' && !category.isIncome ? `
    <button class="sheet-option" onclick="addToRunningTotal(${catIdx},${rowIdx})">
      <span class="sheet-option-icon">➕</span> Add to Total
    </button>` : ''}

    ${hideUp ? '' : `
    <button class="sheet-option" onclick="moveRow(${catIdx},${rowIdx},-1)">
      <span class="sheet-option-icon">▲</span> Move Up
    </button>`}

    ${hideDown ? '' : `
    <button class="sheet-option" onclick="moveRow(${catIdx},${rowIdx},1)">
      <span class="sheet-option-icon">▼</span> Move Down
    </button>`}

    <div class="sheet-version-line">Version ${APP_VERSION}</div>
  `;
  openSheet(html);
}

function switchRowMode(catIdx, rowIdx) {
  const data = loadData(currentYear, currentMonth);
  const row = data[catIdx].rows[rowIdx];
  const fromMode = row.mode ?? 'fully-paid';
  const toMode = fromMode === 'running-total' ? 'fully-paid' : 'running-total';
  const rowName = row.expense || '(unnamed)';

  withUndo(`Switched row "${rowName}" to ${toMode === 'running-total' ? 'Running Total' : 'Fully Paid'}`, () => {
    const d = loadData(currentYear, currentMonth);
    const target = d[catIdx].rows[rowIdx];
    target.mode = toMode;

    if (toMode === 'running-total') {
      target.paid = false;
      if (target.runningTotal === undefined || target.runningTotal === null) {
        target.runningTotal = '';
      }
    } else {
      target.runningTotal = '';
    }

    saveData(currentYear, currentMonth, d);
    renderBudget();
  });

  closeSheet();
}

function moveRow(catIdx, rowIdx, direction) {
  const data = loadData(currentYear, currentMonth);
  const newIdx = rowIdx + direction;
  if (newIdx < 0 || newIdx >= data[catIdx].rows.length) {
    closeSheet();
    return;
  }

  const row = data[catIdx].rows[rowIdx];
  const rowName = row.expense || '(unnamed)';
  withUndo(`Moved row "${rowName}" ${direction < 0 ? 'up' : 'down'}`, () => {
    const d = loadData(currentYear, currentMonth);
    [d[catIdx].rows[rowIdx], d[catIdx].rows[newIdx]] = [d[catIdx].rows[newIdx], d[catIdx].rows[rowIdx]];
    saveData(currentYear, currentMonth, d);
    renderBudget();
  });
  closeSheet();
}

function addToRunningTotal(catIdx, rowIdx) {
  const data = loadData(currentYear, currentMonth);
  const row = data[catIdx].rows[rowIdx];
  const amountStr = prompt('Amount to add to running total:');
  if (amountStr === null) { closeSheet(); return; }
  const amount = parseFloat(amountStr);
  if (isNaN(amount)) { closeSheet(); return; }

  const rowName = row.expense || '(unnamed)';
  // fmt() always returns an absolute value — the minus sign for a negative
  // (correcting) amount has to be added explicitly, same convention used
  // for the summary bar's Budgeted Balance / In Account figures
  withUndo(`Added ${amount < 0 ? '-' : ''}${fmt(amount)} to running total for "${rowName}"`, () => {
    const d = loadData(currentYear, currentMonth);
    const target = d[catIdx].rows[rowIdx];
    target.runningTotal = String((parseFloat(target.runningTotal) || 0) + amount);
    saveData(currentYear, currentMonth, d);
    renderBudget();
  });
  closeSheet();
}

// ── Pie Chart (SVG donut) ─────────────────────────────────────────────────────
// Renders a donut chart of expense categories as % of total expenses.
// Income is always excluded. Returns an empty string if there is no
// expense data yet, which hides the chart entirely.
function renderChart(data) {
  const expenses = data.filter(c => !c.isIncome);
  const totals   = expenses.map(c => c.rows.reduce((s, r) => s + (parseFloat(r.cost) || 0), 0));
  const total    = totals.reduce((a, b) => a + b, 0);

  if (total === 0) return '';

  const size   = 160;
  const cx     = size / 2;
  const cy     = size / 2;
  const radius = 60; // outer radius of donut
  const inner  = 30; // inner radius — creates the "hole"

  let slices = '';
  let angle  = -Math.PI / 2; // start at 12 o'clock

  expenses.forEach((cat, i) => {
    const pct = totals[i] / total;
    if (pct === 0) return; // skip categories with no spend
    const sweep = pct * 2 * Math.PI;
    const x1 = cx + radius * Math.cos(angle);
    const y1 = cy + radius * Math.sin(angle);
    angle += sweep;
    const x2 = cx + radius * Math.cos(angle);
    const y2 = cy + radius * Math.sin(angle);
    const ix1 = cx + inner * Math.cos(angle - sweep);
    const iy1 = cy + inner * Math.sin(angle - sweep);
    const ix2 = cx + inner * Math.cos(angle);
    const iy2 = cy + inner * Math.sin(angle);
    const large = sweep > Math.PI ? 1 : 0; // SVG arc large-sweep flag

    slices += `<path d="
      M ${ix1} ${iy1}
      L ${x1} ${y1}
      A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}
      L ${ix2} ${iy2}
      A ${inner} ${inner} 0 ${large} 0 ${ix1} ${iy1}
      Z" fill="${cat.colour}" stroke="white" stroke-width="2"/>`;
  });

  const legend = expenses.map((cat, i) => {
    if (totals[i] === 0) return '';
    const pct = ((totals[i] / total) * 100).toFixed(1);
    return `
      <div class="legend-item">
        <div class="legend-dot" style="background:${cat.colour}"></div>
        <span class="legend-name">${escapeHtml(cat.name)}</span>
        <span class="legend-value">${pct}%</span>
      </div>`;
  }).join('');

  return `
    <div class="chart-container">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        ${slices}
      </svg>
      <div class="chart-legend">${legend}</div>
    </div>`;
}

// ── Formatting & Calculations ────────────────────────────────────────────────
function fmt(val) {
  return 'R ' + Math.abs(val).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Calculates the amount a row should deduct from the overall budget running
// balance / Remaining column.
// - fully-paid row -> uses budgeted cost
// - running-total row -> uses greater of budgeted cost and running total
function getBudgetEffect(row) {
  const cost = parseFloat(row.cost) || 0;
  const runningTotal = parseFloat(row.runningTotal) || 0;
  if ((row.mode ?? 'fully-paid') === 'running-total') {
    return Math.max(cost, runningTotal);
  }
  return cost;
}

// Calculates the amount a row should deduct from In Account.
// - fully-paid row -> subtract full cost only when checkbox is ticked
// - running-total row -> subtract entered running total directly
function getInAccountEffect(row) {
  const cost = parseFloat(row.cost) || 0;
  const runningTotal = parseFloat(row.runningTotal) || 0;
  if ((row.mode ?? 'fully-paid') === 'running-total') {
    return runningTotal;
  }
  return row.paid ? cost : 0;
}

// Calculates all summary bar figures for the currently loaded month
function calcSummary(data) {
  let income = 0, totalExpenses = 0, actualSpent = 0;
  data.forEach(cat => {
    cat.rows.forEach(r => {
      const val = parseFloat(r.cost) || 0;
      if (cat.isIncome) {
        income += val;
      } else {
        totalExpenses += val;
        actualSpent += getInAccountEffect(r);
      }
    });
  });
  return {
    income,
    totalExpenses,
    actualSpent,
    balance: income - totalExpenses,
    inAccount: income - actualSpent
  };
}

// Computes the per-row "Remaining" display and per-category section totals
// for the currently loaded data. Shared between the full render and the
// lightweight post-edit DOM patch below, so the running-balance math only
// lives in one place. rowsByCat[catIdx][rowIdx] mirrors data's own shape,
// for O(1) lookup rather than searching a flat list while rendering.
function computeRowDisplays(data, income) {
  const sectionTotals = data.map(cat => cat.rows.reduce((sum, r) => sum + (parseFloat(r.cost) || 0), 0));
  const rowsByCat = [];
  let runningRemaining = income;

  data.forEach(cat => {
    const catRows = cat.rows.map(row => {
      if (cat.isIncome) {
        return { remDisplay: fmt(parseFloat(row.cost) || 0), remCls: 'positive' };
      }
      runningRemaining -= getBudgetEffect(row);
      return {
        remDisplay: (runningRemaining < 0 ? '-' : '') + fmt(runningRemaining),
        remCls: runningRemaining >= 0 ? 'positive' : 'negative'
      };
    });
    rowsByCat.push(catRows);
    if (cat.isIncome) runningRemaining = income;
  });

  return { sectionTotals, rowsByCat };
}

// ── Render ───────────────────────────────────────────────────────────────────
function renderApp() {
  renderYearSelect();
  renderMonthTabs();
  renderBudget();
  checkForAppUpdate();
}

function renderYearSelect() {
  const sel = document.getElementById('yearSelect');
  sel.innerHTML = YEARS.map(y =>
    `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`
  ).join('');
  sel.onchange = () => {
    currentYear = parseInt(sel.value);
    saveLastViewedMonth(currentYear, currentMonth); // remember new year selection too
    renderMonthTabs();
    renderBudget();
  };
}

// Centralized deferred alignment helper — using a short timeout ensures the
// month tabs have finished rendering/layout before we try to scroll them.
// This is used on load, on month/year changes, and on app resume.
function alignActiveMonthTabDeferred() {
  const tabs = document.getElementById('monthTabs');
  if (!tabs) return;

  setTimeout(() => {
    const activeBtn = tabs.querySelector('button.active');
    if (activeBtn) {
      activeBtn.scrollIntoView({ behavior: 'auto', inline: 'start', block: 'nearest' });
    }
  }, 30);
}

function renderMonthTabs() {
  const tabs = document.getElementById('monthTabs');
  tabs.innerHTML = MONTHS.map((m, i) => {
    const locked = isProtected(currentYear, i);
    return `<button class="${i === currentMonth ? 'active' : ''}" onclick="switchMonth(${i})">
      ${m}${locked ? ' 🔒' : ''}
    </button>`;
  }).join('');

  // Scroll the active/current month tab into view, aligned to the left edge,
  // so it appears as the first visible tab in the horizontal scroll area
  alignActiveMonthTabDeferred();
}

function switchMonth(m) {
  currentMonth = m;
  saveLastViewedMonth(currentYear, currentMonth); // remember this as the last viewed month
  renderMonthTabs();
  renderBudget();
}

function renderBudget() {
  const data = loadData(currentYear, currentMonth);
  const { income, totalExpenses, balance, inAccount } = calcSummary(data);
  const balanceCls = balance >= 0 ? 'positive' : 'negative';
  // fmt() always returns an absolute value, so the minus sign has to be
  // added explicitly here — In Account can go negative (overspend) just
  // like Budgeted Balance can, and was previously always shown as positive
  const inAccountCls = inAccount < 0 ? 'negative' : 'in-account';
  const { sectionTotals, rowsByCat } = computeRowDisplays(data, income);

  // Summary bar — each value has a stable id so updateComputedValues() can
  // patch just these numbers after a row edit, without rebuilding the page
  let html = `
    <div class="summary-bar">
      <div class="summary-item">
        <span class="label">Income</span>
        <span class="value" id="summary-income">${fmt(income)}</span>
      </div>
      <div class="summary-item">
        <span class="label">Total Expenses</span>
        <span class="value" id="summary-expenses">${fmt(totalExpenses)}</span>
      </div>
      <div class="summary-item">
        <span class="label">Budgeted Balance</span>
        <span class="value ${balanceCls}" id="summary-balance">${balance < 0 ? '-' : ''}${fmt(balance)}</span>
      </div>
      <div class="summary-item">
        <span class="label">In Account</span>
        <span class="value ${inAccountCls}" id="summary-inaccount">${inAccount < 0 ? '-' : ''}${fmt(inAccount)}</span>
      </div>
    </div>`;

  data.forEach((cat, catIdx) => {
    // Text colour is fixed (set in CSS on .section-header, not here) rather
    // than computed per-category — every palette colour is light/bright
    // enough for black text to stay readable, and a single standard colour
    // was preferred over the header text varying category to category.
    const headerStyle = `background:${cat.colour};`;

    html += `
    <div class="section">
      <div class="section-header" style="${headerStyle}">
        <div class="section-header-left">
          <span>${escapeHtml(cat.name)}</span>
        </div>
        <div class="section-header-right">
          <span class="section-total" id="section-total-${catIdx}">${fmt(sectionTotals[catIdx])}</span>
          <button class="ellipsis-btn" onclick="openCategoryMenu(${catIdx})" aria-label="${escapeHtml(cat.name)} options">⋮</button>
        </div>
      </div>
      <div class="col-headers">
        <div class="ch-expense">${cat.isIncome ? 'Source' : 'Expense'}</div>
        <div class="ch-cost">${cat.isIncome ? 'Amount' : 'Cost'}</div>
        <div class="ch-remaining">Remaining</div>
        <div class="ch-paid">${cat.isIncome ? '' : 'Status'}</div>
        <div class="ch-remove"></div>
      </div>`;

    cat.rows.forEach((row, rowIdx) => {
      const cost = parseFloat(row.cost) || 0;
      const mode = row.mode ?? 'fully-paid';
      const runningTotal = parseFloat(row.runningTotal) || 0;
      const { remDisplay, remCls } = rowsByCat[catIdx][rowIdx];

      const checkedAttr = row.paid ? 'checked' : '';
      const safeExpense = escapeHtml(row.expense);
      // cost/runningTotal are stored as raw strings and can originate from an
      // imported file rather than this app's own number inputs — escape them
      // before interpolating into a value="..." attribute
      const safeCost = escapeHtml(row.cost);
      const safeRunningTotal = escapeHtml(row.runningTotal);

      let statusCell = '';
      if (cat.isIncome) {
        statusCell = `<div class="cell-paid"></div>`;
      } else if (mode === 'running-total') {
        const overBudget = runningTotal > cost;
        statusCell = `
          <div class="cell-paid">
            <input
              type="number"
              id="runtotal-${catIdx}-${rowIdx}"
              class="running-total-input ${overBudget ? 'over-budget' : ''}"
              placeholder="0.00"
              value="${safeRunningTotal}"
              aria-label="Running total"
              onchange="updateRow(${catIdx},${rowIdx},'runningTotal',this.value)"
            />
          </div>`;
      } else {
        statusCell = `
          <div class="cell-paid">
            <input type="checkbox" ${checkedAttr} aria-label="Paid"
              onchange="updateRow(${catIdx},${rowIdx},'paid',this.checked)" />
          </div>`;
      }

      html += `
      <div class="budget-row">
        <div class="cell-expense">
          <input type="text" placeholder="${cat.isIncome ? 'Income source' : 'Expense name'}" value="${safeExpense}" aria-label="${cat.isIncome ? 'Income source' : 'Expense name'}"
            onchange="updateRow(${catIdx},${rowIdx},'expense',this.value)" />
        </div>
        <div class="cell-cost">
          <input type="number" placeholder="0.00" value="${safeCost}" aria-label="${cat.isIncome ? 'Amount' : 'Cost'}"
            onchange="updateRow(${catIdx},${rowIdx},'cost',this.value)" />
        </div>
        <div class="cell-remaining">
          <span class="remaining ${remCls}" id="remaining-${catIdx}-${rowIdx}">${remDisplay}</span>
        </div>
        ${statusCell}
        <div class="cell-remove">
          <button class="row-ellipsis-btn" onclick="openRowMenu(${catIdx},${rowIdx})" aria-label="Row options">⋮</button>
        </div>
      </div>`;
    });

    html += `<button class="add-btn" onclick="addRow(${catIdx})">+ Add row</button></div>`;
  });

  // Pie chart — hidden automatically by renderChart() if no expense data
  // exists. Wrapped so updateComputedValues() can refresh just this subtree.
  html += `<div id="chartContainer">${renderChart(data)}</div>`;

  html += `<button class="add-category-btn" onclick="addCategory()">+ Add Category</button>`;

  document.getElementById('budgetContent').innerHTML = html;
}

// Patches just the numbers that change as a result of editing a row's value
// (Remaining column, section totals, summary bar, over-budget flag, pie
// chart) without touching any input element. Editing a field only ever
// fires on blur (onchange), so the input the user just used already shows
// exactly what they typed — rebuilding the whole page here would destroy
// and recreate every input's DOM node for no visual benefit, which is what
// used to cause focus/keyboard loss when moving straight to the next field.
function updateComputedValues() {
  const data = loadData(currentYear, currentMonth);
  const { income, totalExpenses, balance, inAccount } = calcSummary(data);
  const balanceCls = balance >= 0 ? 'positive' : 'negative';
  const inAccountCls = inAccount < 0 ? 'negative' : 'in-account';
  const { sectionTotals, rowsByCat } = computeRowDisplays(data, income);

  setText('summary-income', fmt(income));
  setText('summary-expenses', fmt(totalExpenses));
  setTextAndClass('summary-balance', (balance < 0 ? '-' : '') + fmt(balance), `value ${balanceCls}`);
  setTextAndClass('summary-inaccount', (inAccount < 0 ? '-' : '') + fmt(inAccount), `value ${inAccountCls}`);

  data.forEach((cat, catIdx) => {
    setText(`section-total-${catIdx}`, fmt(sectionTotals[catIdx]));

    cat.rows.forEach((row, rowIdx) => {
      const { remDisplay, remCls } = rowsByCat[catIdx][rowIdx];
      setTextAndClass(`remaining-${catIdx}-${rowIdx}`, remDisplay, `remaining ${remCls}`);

      if ((row.mode ?? 'fully-paid') === 'running-total') {
        const cost = parseFloat(row.cost) || 0;
        const runningTotal = parseFloat(row.runningTotal) || 0;
        toggleClass(`runtotal-${catIdx}-${rowIdx}`, 'over-budget', runningTotal > cost);
      }
    });
  });

  const chartEl = document.getElementById('chartContainer');
  if (chartEl) chartEl.innerHTML = renderChart(data);
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setTextAndClass(id, text, className) {
  const el = document.getElementById(id);
  if (el) { el.textContent = text; el.className = className; }
}

function toggleClass(id, className, active) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle(className, active);
}

// ── Row Mutations ────────────────────────────────────────────────────────────
function updateRow(catIdx, rowIdx, field, value) {
  const data = loadData(currentYear, currentMonth);
  const expenseName = data[catIdx].rows[rowIdx].expense || '(unnamed)';
  const fieldLabel =
    field === 'expense' ? 'name' :
    field === 'cost' ? 'cost' :
    field === 'runningTotal' ? 'running total' :
    'paid status';

  withUndo(`Edited ${fieldLabel} of "${expenseName}"`, () => {
    const d = loadData(currentYear, currentMonth);
    d[catIdx].rows[rowIdx][field] = value;
    const saved = saveData(currentYear, currentMonth, d);
    // On success, patch just the numbers that changed — the input the user
    // just edited already shows what they typed, so there's no need to
    // rebuild the page (see updateComputedValues()). On failure, fall back
    // to a full render so the UI reflects the reverted, actually-persisted
    // data — saveData() already surfaced a toast explaining why, so there's
    // no mid-edit focus left to preserve here anyway.
    if (saved) updateComputedValues(); else renderBudget();
  });
}

function addRow(catIdx) {
  const data = loadData(currentYear, currentMonth);
  const catName = data[catIdx].name;
  withUndo(`Added row to "${catName}"`, () => {
    const d = loadData(currentYear, currentMonth);
    d[catIdx].rows.push({ expense: '', cost: '', paid: false, mode: 'fully-paid', runningTotal: '' });
    saveData(currentYear, currentMonth, d);
    renderBudget();
  });
}

function removeRow(catIdx, rowIdx) {
  const data = loadData(currentYear, currentMonth);
  // Never allow the last row in a category to be removed
  if (data[catIdx].rows.length > 1) {
    const row = data[catIdx].rows[rowIdx];
    const desc = `Removed row "${row.expense || '(unnamed)'}" (${fmt(parseFloat(row.cost) || 0)}) from "${data[catIdx].name}"`;
    withUndo(desc, () => {
      const d = loadData(currentYear, currentMonth);
      d[catIdx].rows.splice(rowIdx, 1);
      saveData(currentYear, currentMonth, d);
      renderBudget();
    });
    closeSheet();
  } else {
    closeSheet();
    showToast('Cannot remove the last row in a category. Delete the category instead if it\'s no longer needed.');
  }
}

// ── Boot ─────────────────────────────────────────────────────────────────────
renderApp();