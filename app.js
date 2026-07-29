// ── Config ───────────────────────────────────────────────────────────────────
const CACHE_NAME = 'budget-app-v4.4';
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({length: 5}, (_, i) => CURRENT_YEAR + i); // current year + 4 ahead

const INCOME_COLOUR = '#e5e5ea'; // Income's default fixed colour, independently selectable from expense palette
const UNDO_LIMIT = 10; // maximum undo/redo steps retained

// 16-colour palette used for expense category headers and pie chart slices
const PALETTE = [
  '#FF6B6B', '#2ECC71', '#3498DB', '#9B59B6',
  '#FF9F43', '#1ABC9C', '#FF6EB4', '#F39C12',
  '#5C6BC0', '#A3CB38', '#E84393', '#4A90D9',
  '#6D9E73', '#A0522D', '#708090', '#F1C40F'
];

// Default category set used when a month has no saved data yet
const DEFAULT_CATEGORIES = [
  { name: 'Income',        colour: INCOME_COLOUR, isIncome: true,  rows: [{ expense: '', cost: '', paid: false }] },
  { name: 'Tithes',        colour: PALETTE[0],    isIncome: false, rows: [{ expense: '', cost: '', paid: false }] },
  { name: 'Home',          colour: PALETTE[1],    isIncome: false, rows: [{ expense: '', cost: '', paid: false }] },
  { name: 'Vehicles',      colour: PALETTE[2],    isIncome: false, rows: [{ expense: '', cost: '', paid: false }] },
  { name: 'Debits',        colour: PALETTE[3],    isIncome: false, rows: [{ expense: '', cost: '', paid: false }] },
  { name: 'Food',          colour: PALETTE[4],    isIncome: false, rows: [{ expense: '', cost: '', paid: false }] },
  { name: 'Fuel',          colour: PALETTE[5],    isIncome: false, rows: [{ expense: '', cost: '', paid: false }] },
  { name: 'Entertainment', colour: PALETTE[6],    isIncome: false, rows: [{ expense: '', cost: '', paid: false }] }
];

let currentYear  = CURRENT_YEAR;
let currentMonth = new Date().getMonth();

// Restore last viewed month/year if the app was previously opened —
// keeps the user on whatever month they were looking at when they last
// closed or minimized the app, rather than always resetting to "today"
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

const ICON_UNDO = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a5 5 0 0 1 0 10H11"/></svg>`;

const ICON_REDO = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14l5-5-5-5"/><path d="M20 9H10a5 5 0 0 0 0 10h3"/></svg>`;

const ICON_RENAME = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>`;

// ── Service Worker ──────────────────────────────────────────────────────────
// updateViaCache: 'none' prevents the browser's HTTP cache from serving a stale
// sw.js file, which was previously blocking update detection on iOS Safari
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          if (confirm('A new version of BudgetApp is available. Refresh now?')) {
            window.location.reload();
          }
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
  }
});

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
  localStorage.setItem(protectionKey(year, month), value ? 'true' : 'false');
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

// ── Last Viewed Month Persistence ────────────────────────────────────────────
// Remembers whichever month/year tab was last open so that re-opening the
// app (e.g. from the iPhone home screen after being minimized) returns the
// user to where they left off, rather than resetting to today's month.
function saveLastViewedMonth(year, month) {
  localStorage.setItem('lastViewedMonth', JSON.stringify({ year, month }));
}

function loadLastViewedMonth() {
  const raw = localStorage.getItem('lastViewedMonth');
  return raw ? JSON.parse(raw) : null;
}

// ── Undo / Redo ──────────────────────────────────────────────────────────────
// Snapshot-based undo system — captures the entire relevant localStorage state
// before every mutating action, rather than tracking diffs. Simpler and more
// reliable at the cost of slightly larger stored snapshots.

function getUndoStack() {
  const raw = localStorage.getItem('__undoStack');
  return raw ? JSON.parse(raw) : [];
}
function setUndoStack(stack) {
  localStorage.setItem('__undoStack', JSON.stringify(stack));
}
function getRedoStack() {
  const raw = localStorage.getItem('__redoStack');
  return raw ? JSON.parse(raw) : [];
}
function setRedoStack(stack) {
  localStorage.setItem('__redoStack', JSON.stringify(stack));
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

// Wipes all current budget/protection keys and replaces them with a snapshot
function restoreState(snapshot) {
  const toRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (isRelevantKey(key)) toRemove.push(key);
  }
  toRemove.forEach(k => localStorage.removeItem(k));
  Object.keys(snapshot).forEach(k => localStorage.setItem(k, snapshot[k]));
}

// Must be called BEFORE a mutation happens — records the state as it was
// immediately prior to the action about to be performed
function recordUndo(description) {
  const stack = getUndoStack();
  stack.push({ desc: description, snapshot: snapshotState() });
  while (stack.length > UNDO_LIMIT) stack.shift(); // cap at UNDO_LIMIT, drop oldest
  setUndoStack(stack);
  setRedoStack([]); // any new action invalidates the redo stack (standard behaviour)
}

// Wraps a mutating function with automatic undo recording
function withUndo(description, mutateFn) {
  recordUndo(description);
  mutateFn();
}

function undoLastAction() {
  const undoStack = getUndoStack();
  if (undoStack.length === 0) { closeSheet(); alert('Nothing to undo.'); return; }
  const entry = undoStack.pop();
  setUndoStack(undoStack);

  // Push current state onto redo stack before restoring the older snapshot
  const redoStack = getRedoStack();
  redoStack.push({ desc: entry.desc, snapshot: snapshotState() });
  while (redoStack.length > UNDO_LIMIT) redoStack.shift();
  setRedoStack(redoStack);

  restoreState(entry.snapshot);
  closeSheet();
  renderMonthTabs();
  renderBudget();
  renderActionBar();
  alert(`Undone: ${entry.desc}`);
}

function redoLastAction() {
  const redoStack = getRedoStack();
  if (redoStack.length === 0) { closeSheet(); alert('Nothing to redo.'); return; }
  const entry = redoStack.pop();
  setRedoStack(redoStack);

  // Push current state back onto undo stack before reapplying
  const undoStack = getUndoStack();
  undoStack.push({ desc: entry.desc, snapshot: snapshotState() });
  while (undoStack.length > UNDO_LIMIT) undoStack.shift();
  setUndoStack(undoStack);

  restoreState(entry.snapshot);
  closeSheet();
  renderMonthTabs();
  renderBudget();
  renderActionBar();
  alert(`Redone: ${entry.desc}`);
}

// ── Data ────────────────────────────────────────────────────────────────────
function loadData(year, month) {
  const raw = localStorage.getItem(storageKey(year, month));
  if (raw) {
    const parsed = JSON.parse(raw);
    // Enforce isIncome strictly by index 0 — protects against legacy saved
    // data (pre-v4.0) that never had this flag, which caused Income to be
    // incorrectly treated as an expense
    return parsed.map((cat, idx) => ({
      ...cat,
      isIncome: idx === 0,
      colour: cat.colour || (idx === 0 ? INCOME_COLOUR : PALETTE[idx % PALETTE.length])
    }));
  }
  return DEFAULT_CATEGORIES.map(c => ({ ...c, rows: c.rows.map(r => ({ ...r })) }));
}

function saveData(year, month, data) {
  localStorage.setItem(storageKey(year, month), JSON.stringify(data));
  // Any manual save automatically protects the month from being
  // overwritten by Set as Template propagation
  setProtected(year, month, true);
  renderMonthTabs();
  renderActionBar();
}

// ── Template Propagation ─────────────────────────────────────────────────────
function setAsTemplate() {
  if (!confirm(`Copy ${MONTHS[currentMonth]} ${currentYear} to all unprotected following months?`)) return;
  withUndo(`Set as Template from ${MONTHS[currentMonth]} ${currentYear}`, () => {
    const data = loadData(currentYear, currentMonth);
    let count = 0;

    // Remaining months in the current year
    for (let m = currentMonth + 1; m < 12; m++) {
      if (!isProtected(currentYear, m)) {
        localStorage.setItem(storageKey(currentYear, m), JSON.stringify(
          data.map(cat => ({ ...cat, rows: cat.rows.map(r => ({ expense: r.expense, cost: r.cost, paid: false })) }))
        ));
        count++;
      }
    }
    // All months in all future years — enables multi-year roll forward
    for (let y = currentYear + 1; y <= CURRENT_YEAR + 4; y++) {
      for (let m = 0; m < 12; m++) {
        if (!isProtected(y, m)) {
          localStorage.setItem(storageKey(y, m), JSON.stringify(
            data.map(cat => ({ ...cat, rows: cat.rows.map(r => ({ expense: r.expense, cost: r.cost, paid: false })) }))
          ));
          count++;
        }
      }
    }
    alert(`Done! ${count} month${count !== 1 ? 's' : ''} updated.`);
    renderBudget();
  });
}

function toggleProtection() {
  const willProtect = !isProtected(currentYear, currentMonth);
  withUndo(`${willProtect ? 'Protected' : 'Unprotected'} ${MONTHS[currentMonth]} ${currentYear}`, () => {
    setProtected(currentYear, currentMonth, willProtect);
    renderMonthTabs();
    renderActionBar();
  });
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

// ── Main Menu ────────────────────────────────────────────────────────────────
// Triggered by tapping the app name/icon in the header
function openMainMenu() {
  const undoCount = getUndoStack().length;
  const redoCount = getRedoStack().length;

  const html = `
    <div class="sheet-handle"></div>
    <div class="sheet-title">BudgetApp Menu</div>

    <button class="sheet-option" onclick="openExportMenu()">
      <span class="sheet-option-icon">${ICON_EXPORT}</span> Export
    </button>

    <button class="sheet-option" onclick="openImportMenu()">
      <span class="sheet-option-icon">${ICON_IMPORT}</span> Import
    </button>

    <button class="sheet-option" onclick="openPermissionsMenu()">
      <span class="sheet-option-icon">${ICON_PERMISSIONS}</span> Permissions
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

    <button class="sheet-cancel" onclick="closeSheet()">Cancel</button>
  `;
  openSheet(html);
}

// ── Export Menu ──────────────────────────────────────────────────────────────
function openExportMenu() {
  const html = `
    <div class="sheet-handle"></div>
    <div class="sheet-title">Export</div>

    <button class="sheet-option" onclick="exportCurrentMonth()">
      <span class="sheet-option-icon">📄</span> Export Current Month As Template
    </button>

    <button class="sheet-option" onclick="exportFullHistory()">
      <span class="sheet-option-icon">🗂️</span> Export Entire Budget History
    </button>

    <button class="sheet-cancel" onclick="closeSheet()">Cancel</button>
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
    if (isRelevantKey(key)) entries[key] = JSON.parse(localStorage.getItem(key));
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
    <div class="sheet-handle"></div>
    <div class="sheet-title">Import</div>

    <button class="sheet-option" onclick="triggerImport('month')">
      <span class="sheet-option-icon">📄</span> Import a Single Month Template
    </button>

    <button class="sheet-option" onclick="triggerImport('history')">
      <span class="sheet-option-icon">🗂️</span> Import Budget History
    </button>

    <button class="sheet-cancel" onclick="closeSheet()">Cancel</button>
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
          alert('This file is not a valid single month template.');
          return;
        }
        if (!confirm(`Import this template into ${MONTHS[currentMonth]} ${currentYear}? This will overwrite existing data for this month.`)) return;

        withUndo(`Imported template into ${MONTHS[currentMonth]} ${currentYear}`, () => {
          saveData(currentYear, currentMonth, parsed.data);
          if (typeof parsed.protected === 'boolean') setProtected(currentYear, currentMonth, parsed.protected);
          renderBudget();
        });
        alert('Import complete.');
      }

      if (pendingImportType === 'history') {
        if (parsed.type !== 'history' || !parsed.entries) {
          alert('This file is not a valid budget history export.');
          return;
        }
        const keyCount = Object.keys(parsed.entries).length;
        if (!confirm(`Import full history? This will overwrite ${keyCount} saved month(s)/setting(s).`)) return;

        withUndo('Imported full budget history', () => {
          Object.keys(parsed.entries).forEach(key => {
            localStorage.setItem(key, JSON.stringify(parsed.entries[key]));
          });
          renderMonthTabs();
          renderBudget();
          renderActionBar();
        });
        alert('Import complete.');
      }
    } catch (err) {
      alert('Could not read this file. Please make sure it is a valid BudgetApp export.');
    }
    event.target.value = ''; // reset so the same file can be re-selected later
    pendingImportType = null;
  };
  reader.readAsText(file);
}

// ── Permissions Menu ─────────────────────────────────────────────────────────
function openPermissionsMenu() {
  const html = `
    <div class="sheet-handle"></div>
    <div class="sheet-title">Permissions</div>
    <div id="permissionStatusRow" class="permission-status">
      <span>Persistent Storage</span>
      <span class="permission-badge">Checking...</span>
    </div>
    <button class="sheet-cancel" onclick="closeSheet()">Cancel</button>
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

// ── Category Management Menu ─────────────────────────────────────────────────
function openCategoryMenu(catIdx) {
  const data    = loadData(currentYear, currentMonth);
  const cat     = data[catIdx];
  const isInc   = cat.isIncome;
  // Move Up is disabled for Income and for any category already at index 1
  // (directly below Income) — prevents anything from landing on index 0
  const disableUp   = isInc || catIdx <= 1;
  const disableDown = isInc || catIdx === data.length - 1;

  const html = `
    <div class="sheet-handle"></div>
    <div class="sheet-title">${cat.name}</div>

    <button class="sheet-option ${isInc ? 'disabled' : ''}"
      onclick="${isInc ? '' : `sheetRename(${catIdx})`}">
      <span class="sheet-option-icon">${ICON_RENAME}</span> Rename
    </button>

    <button class="sheet-option" onclick="sheetColour(${catIdx})">
      <span class="sheet-option-icon">🎨</span> Change Colour
    </button>

    <button class="sheet-option ${disableUp ? 'disabled' : ''}"
      onclick="${disableUp ? '' : `sheetMove(${catIdx},-1)`}">
      <span class="sheet-option-icon">▲</span> Move Up
    </button>

    <button class="sheet-option ${disableDown ? 'disabled' : ''}"
      onclick="${disableDown ? '' : `sheetMove(${catIdx},1)`}">
      <span class="sheet-option-icon">▼</span> Move Down
    </button>

    <button class="sheet-option destructive ${isInc ? 'disabled' : ''}"
      onclick="${isInc ? '' : `sheetDelete(${catIdx})`}">
      <span class="sheet-option-icon">🗑️</span> Delete
    </button>

    <button class="sheet-cancel" onclick="closeSheet()">Cancel</button>
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
    <div class="sheet-handle"></div>
    <div class="sheet-title">Choose Colour</div>
    <div class="colour-grid">${swatches}</div>
    <button class="sheet-cancel" onclick="closeSheet()">Cancel</button>
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
    data.push({ name: name.trim(), colour, isIncome: false, rows: [{ expense: '', cost: '', paid: false }] });
    saveData(currentYear, currentMonth, data);
    renderBudget();
  });
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
        <span class="legend-name">${cat.name}</span>
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

// Calculates all summary bar figures for the currently loaded month
function calcSummary(data) {
  let income = 0, totalExpenses = 0, paidExpenses = 0;
  data.forEach(cat => {
    cat.rows.forEach(r => {
      const val = parseFloat(r.cost) || 0;
      if (cat.isIncome) {
        income += val;
      } else {
        totalExpenses += val;
        if (r.paid) paidExpenses += val;
      }
    });
  });
  return {
    income,
    totalExpenses,
    paidExpenses,
    balance: income - totalExpenses,
    inAccount: income - paidExpenses // Income minus only PAID expenses
  };
}

// ── Render ───────────────────────────────────────────────────────────────────
function renderApp() {
  renderYearSelect();
  renderMonthTabs();
  renderBudget();
  renderActionBar();
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
    renderActionBar();
  };
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
  const activeBtn = tabs.querySelector('button.active');
  if (activeBtn) {
    activeBtn.scrollIntoView({ behavior: 'auto', inline: 'start', block: 'nearest' });
  }
}

function switchMonth(m) {
  currentMonth = m;
  saveLastViewedMonth(currentYear, currentMonth); // remember this as the last viewed month
  renderMonthTabs();
  renderBudget();
  renderActionBar();
}

function renderActionBar() {
  const locked = isProtected(currentYear, currentMonth);
  document.getElementById('actionBar').innerHTML = `
    <button class="action-btn template-btn" onclick="setAsTemplate()">📋 Set as Template</button>
    <button class="action-btn protect-btn ${locked ? 'protected' : ''}" onclick="toggleProtection()">
      ${locked ? '🔒 Protected' : '🔓 Unprotected'}
    </button>
  `;
}

function renderBudget() {
  const data = loadData(currentYear, currentMonth);
  const { income, totalExpenses, paidExpenses, balance, inAccount } = calcSummary(data);
  const balanceCls = balance >= 0 ? 'positive' : 'negative';

  // Summary bar
  let html = `
    <div class="summary-bar">
      <div class="summary-item">
        <span class="label">Income</span>
        <span class="value">${fmt(income)}</span>
      </div>
      <div class="summary-item">
        <span class="label">Total Expenses</span>
        <span class="value">${fmt(totalExpenses)}</span>
      </div>
      <div class="summary-item">
        <span class="label">Balance</span>
        <span class="value ${balanceCls}">${balance < 0 ? '-' : ''}${fmt(balance)}</span>
      </div>
      <div class="summary-item">
        <span class="label">In Account</span>
        <span class="value in-account">${fmt(inAccount)}</span>
      </div>
    </div>`;

  // Running remaining balance, deducted category by category, row by row
  let runningRemaining = income;

  data.forEach((cat, catIdx) => {
    const sectionTotal = cat.rows.reduce((sum, r) => sum + (parseFloat(r.cost) || 0), 0);
    const headerStyle  = `background:${cat.colour};`;

    html += `
    <div class="section">
      <div class="section-header" style="${headerStyle}">
        <div class="section-header-left">
          <span>${cat.name}</span>
        </div>
        <div class="section-header-right">
          <span class="section-total">${fmt(sectionTotal)}</span>
          <button class="ellipsis-btn" onclick="openCategoryMenu(${catIdx})">⋯</button>
        </div>
      </div>
      <div class="col-headers">
        <div class="ch-expense">Expense</div>
        <div class="ch-cost">Cost</div>
        <div class="ch-remaining">Remaining</div>
        <div class="ch-paid">Paid</div>
        <div class="ch-remove"></div>
      </div>`;

    cat.rows.forEach((row, rowIdx) => {
      const cost = parseFloat(row.cost) || 0;
      let remDisplay, remCls;

      if (cat.isIncome) {
        // Income rows simply display their own value as "remaining"
        remDisplay = fmt(cost);
        remCls     = 'positive';
      } else {
        runningRemaining -= cost;
        remDisplay = (runningRemaining < 0 ? '-' : '') + fmt(runningRemaining);
        remCls     = runningRemaining >= 0 ? 'positive' : 'negative';
      }

      const checkedAttr = row.paid ? 'checked' : '';
      const safeExpense = row.expense.replace(/"/g, '&quot;').replace(/'/g, '&#39;');

      html += `
      <div class="budget-row">
        <div class="cell-expense">
          <input type="text" placeholder="Expense name" value="${safeExpense}"
            onchange="updateRow(${catIdx},${rowIdx},'expense',this.value)" />
        </div>
        <div class="cell-cost">
          <input type="number" placeholder="0.00" value="${row.cost}"
            onchange="updateRow(${catIdx},${rowIdx},'cost',this.value)" />
        </div>
        <div class="cell-remaining">
          <span class="remaining ${remCls}">${remDisplay}</span>
        </div>
        <div class="cell-paid">
          <input type="checkbox" ${checkedAttr}
            onchange="updateRow(${catIdx},${rowIdx},'paid',this.checked)" />
        </div>
        <div class="cell-remove">
          <button class="remove-btn" onclick="removeRow(${catIdx},${rowIdx})">−</button>
        </div>
      </div>`;
    });

    // Reset running remaining back to income once Income category is done
    if (cat.isIncome) runningRemaining = income;

    html += `<button class="add-btn" onclick="addRow(${catIdx})">+ Add row</button></div>`;
  });

  // Pie chart — hidden automatically by renderChart() if no expense data exists
  html += renderChart(data);

  html += `<button class="add-category-btn" onclick="addCategory()">+ Add Category</button>`;

  document.getElementById('budgetContent').innerHTML = html;
}

// ── Row Mutations ────────────────────────────────────────────────────────────
function updateRow(catIdx, rowIdx, field, value) {
  const data = loadData(currentYear, currentMonth);
  const expenseName = data[catIdx].rows[rowIdx].expense || '(unnamed)';
  const fieldLabel = field === 'expense' ? 'name' : field === 'cost' ? 'cost' : 'paid status';

  withUndo(`Edited ${fieldLabel} of "${expenseName}"`, () => {
    const d = loadData(currentYear, currentMonth);
    d[catIdx].rows[rowIdx][field] = value;
    saveData(currentYear, currentMonth, d);
    renderBudget();
  });
}

function addRow(catIdx) {
  const data = loadData(currentYear, currentMonth);
  const catName = data[catIdx].name;
  withUndo(`Added row to "${catName}"`, () => {
    const d = loadData(currentYear, currentMonth);
    d[catIdx].rows.push({ expense: '', cost: '', paid: false });
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
  }
}

// ── Boot ─────────────────────────────────────────────────────────────────────
renderApp();