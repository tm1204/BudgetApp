const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const APP_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

// APP_VERSION is declared with `const` inside app.js, so it lives in the vm
// context's lexical environment rather than as a property of the context's
// global object — reading context.APP_VERSION from the host side would
// silently be undefined (same reason context.pendingImportType doesn't work
// below). Extracting it from source text is the only reliable way to know
// what version the loaded app.js will compare itself against.
const RUNNING_VERSION_MATCH = APP_SOURCE.match(/const APP_VERSION = '([^']+)'/);
if (!RUNNING_VERSION_MATCH) throw new Error('Could not find APP_VERSION in app.js — did it move or get renamed?');
const RUNNING_VERSION = RUNNING_VERSION_MATCH[1];

// Storage mock. `failKeys` simulates a full/unavailable quota by throwing on
// setItem for specific keys — this is how the "storage full" fixes are
// exercised without needing a real browser quota to fill up.
function createStorage(initial = {}, { failKeys = new Set() } = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) {
      if (failKeys.has(key)) {
        const err = new Error('Quota exceeded');
        err.name = 'QuotaExceededError';
        throw err;
      }
      store.set(key, String(value));
    },
    removeItem(key) { store.delete(key); },
    clear() { store.clear(); },
    key(index) { return Array.from(store.keys())[index] ?? null; },
    get length() { return store.size; },
    _store: store
  };
}

function createDom() {
  const elements = new Map();
  const document = {
    body: {},
    addEventListener() {},
    createElement(tag) {
      if (tag === 'a') return { click() {}, setAttribute() {} };
      return {};
    },
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, { innerHTML: '', classList: { add() {}, remove() {} }, style: {}, value: '', click() {} });
      }
      return elements.get(id);
    }
  };
  return { document, elements };
}

// Builds a fresh vm context, loads app.js into it, and returns handles used
// by the tests. Every test gets its own isolated context/storage so mutating
// module-level state (currentYear, undo stacks, etc.) can't leak across tests.
//
// confirmReturns may be a plain boolean (same answer every time) or a
// function(message) => boolean for tests that need to answer differently
// across multiple confirm() calls (e.g. decline then accept).
//
// fetchVersionPayload, if provided, controls what the mocked fetch() resolves
// with — used to simulate version.json reporting a specific remote version.
// A plain object is returned for every call. A function is called fresh for
// EACH call with a 1-based call count, letting a test give a different
// answer to app.js's own automatic boot-time check (always call #1, fired
// from renderApp() during vm.runInContext — before loadApp() even returns)
// than to calls the test itself makes afterwards. Left undefined, fetch
// always rejects (network unavailable), matching the original tests'
// offline-safe default.
//
// registrationOverride controls what navigator.serviceWorker.getRegistration()
// resolves to, e.g. { waiting: fakeWorker } to simulate an update already
// sitting in the waiting state.
function loadApp({ storage, confirmReturns = true, promptReturns = null, fetchVersionPayload, registrationOverride = null } = {}) {
  const { document } = createDom();
  const alerts = [];
  const confirms = [];
  const reloads = [];
  const swListeners = {};
  const confirmFn = typeof confirmReturns === 'function' ? confirmReturns : () => confirmReturns;
  let fetchCallCount = 0;
  // app.js constructs its own `new FileReader()` internally, so the content
  // it should "read" can't be passed in as a constructor arg — this holder
  // is captured by closure and mutated by importFile() right before the call
  const fileContentHolder = { value: '{}' };

  const navigator = {
    serviceWorker: {
      register() { return Promise.resolve({ addEventListener() {}, update() {} }); },
      getRegistration() { return Promise.resolve(registrationOverride); },
      // Captures listeners registered on the shared serviceWorker container
      // (distinct from a single registration's own addEventListener above) —
      // this is what reloadWithLatestServiceWorker() listens for 'controllerchange' on
      addEventListener(event, cb) { (swListeners[event] = swListeners[event] || []).push(cb); }
    },
    storage: {
      persist() { return Promise.resolve(false); },
      persisted() { return Promise.resolve(false); }
    }
  };

  const context = vm.createContext({
    console,
    window: { location: { reload() { reloads.push(true); } } },
    document,
    navigator,
    localStorage: storage,
    alert(msg) { alerts.push(msg); },
    confirm(msg) { confirms.push(msg); return confirmFn(msg); },
    prompt() { return promptReturns; },
    fetch() {
      fetchCallCount++;
      if (fetchVersionPayload !== undefined) {
        const payload = typeof fetchVersionPayload === 'function' ? fetchVersionPayload(fetchCallCount) : fetchVersionPayload;
        return Promise.resolve({ ok: true, json: () => Promise.resolve(payload) });
      }
      // app.js fetches version.json on every render; default to an
      // always-failing network request (caught and ignored by
      // checkForAppUpdate's .catch) unless a test opts in above
      return Promise.reject(new Error('fetch disabled in tests'));
    },
    URL: { createObjectURL() { return 'blob://test'; }, revokeObjectURL() {} },
    Blob: class Blob {},
    FileReader: class FileReader {
      readAsText() {}
      set onload(value) { value({ target: { result: fileContentHolder.value } }); }
    },
    setTimeout,
    clearTimeout,
    Date,
    Math,
    JSON,
    parseFloat,
    parseInt,
    Array,
    Object,
    String,
    Number,
    Promise,
    RegExp,
    Boolean,
    Error
  });

  vm.runInContext(APP_SOURCE, context, { filename: 'app.js' });
  return { context, document, alerts, confirms, fileContentHolder, reloads, swListeners };
}

// Flushes pending microtasks (promise .then chains) without relying on a
// fixed setTimeout delay racing real I/O.
function flushMicrotasks() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

// Simulates picking a file for import. Goes through the real triggerImport()
// rather than setting app.js's module-level `pendingImportType` directly —
// that variable is declared with `let`, and in a vm context `let`/`const`
// bindings live in a separate lexical environment from the global object, so
// writing context.pendingImportType from the host side would silently be a
// no-op as far as the running script is concerned.
function importFile(app, type, content) {
  app.context.triggerImport(type);
  app.fileContentHolder.value = content;
  app.context.handleImportFile({ target: { files: [{}], value: '' } });
}

test('renders budget safely when stored data is malformed', () => {
  const storage = createStorage({
    lastViewedMonth: '{bad json',
    budget_2026_7: '{bad json'
  });
  const { context, document } = loadApp({ storage });

  assert.ok(document.getElementById('budgetContent').innerHTML.includes('Income'));
  assert.ok(document.getElementById('budgetContent').innerHTML.includes('Budgeted Balance'));
});

test('reorders rows within a category', () => {
  const storage = createStorage({
    lastViewedMonth: JSON.stringify({ year: 2026, month: 6 }),
    budget_2026_6: JSON.stringify([
      { name: 'Income', colour: '#e5e5ea', isIncome: true, rows: [{ expense: 'Salary', cost: '100', paid: false, mode: 'fully-paid', runningTotal: '' }] },
      { name: 'Food', colour: '#FF6B6B', isIncome: false, rows: [
        { expense: 'Milk', cost: '10', paid: false, mode: 'fully-paid', runningTotal: '' },
        { expense: 'Bread', cost: '5', paid: false, mode: 'fully-paid', runningTotal: '' }
      ] }
    ])
  });
  const { context } = loadApp({ storage });

  context.moveRow(1, 1, -1);

  const saved = JSON.parse(storage.getItem('budget_2026_6'));
  assert.equal(saved[1].rows[0].expense, 'Bread');
  assert.equal(saved[1].rows[1].expense, 'Milk');
});

test('In Account shows a negative sign and the negative colour class when overspent', () => {
  const storage = createStorage({
    lastViewedMonth: JSON.stringify({ year: 2026, month: 6 }),
    budget_2026_6: JSON.stringify([
      { name: 'Income', colour: '#e5e5ea', isIncome: true, rows: [{ expense: 'Salary', cost: '100', paid: false, mode: 'fully-paid', runningTotal: '' }] },
      { name: 'Food', colour: '#FF6B6B', isIncome: false, rows: [
        { expense: 'Groceries', cost: '150', paid: true, mode: 'fully-paid', runningTotal: '' }
      ] }
    ])
  });
  const { document } = loadApp({ storage });

  const html = document.getElementById('budgetContent').innerHTML;
  const match = html.match(/In Account<\/span>\s*<span class="value ([^"]+)">(-?)R/);
  assert.ok(match, 'In Account value not found in rendered output');
  assert.equal(match[1], 'negative');
  assert.equal(match[2], '-');
});

test('a full storage quota does not silently drop a row edit', () => {
  const storage = createStorage({
    lastViewedMonth: JSON.stringify({ year: 2026, month: 6 }),
    budget_2026_6: JSON.stringify([
      { name: 'Income', colour: '#e5e5ea', isIncome: true, rows: [{ expense: 'Salary', cost: '100', paid: false, mode: 'fully-paid', runningTotal: '' }] },
      { name: 'Food', colour: '#FF6B6B', isIncome: false, rows: [{ expense: 'Milk', cost: '10', paid: false, mode: 'fully-paid', runningTotal: '' }] }
    ])
  }, { failKeys: new Set(['budget_2026_6']) });
  const { context, alerts } = loadApp({ storage });

  assert.doesNotThrow(() => context.updateRow(1, 0, 'expense', 'Bread'));

  // The write failed, so the previously persisted value must remain intact —
  // the edit must be visibly rejected, not silently discarded
  const saved = JSON.parse(storage.getItem('budget_2026_6'));
  assert.equal(saved[1].rows[0].expense, 'Milk');
  assert.ok(alerts.some(a => /storage is full/i.test(a)), 'expected a storage-full warning to be shown');
});

test('a full undo-stack quota still applies the edit, but warns undo is unavailable', () => {
  const storage = createStorage({
    lastViewedMonth: JSON.stringify({ year: 2026, month: 6 }),
    budget_2026_6: JSON.stringify([
      { name: 'Income', colour: '#e5e5ea', isIncome: true, rows: [{ expense: 'Salary', cost: '100', paid: false, mode: 'fully-paid', runningTotal: '' }] },
      { name: 'Food', colour: '#FF6B6B', isIncome: false, rows: [{ expense: 'Milk', cost: '10', paid: false, mode: 'fully-paid', runningTotal: '' }] }
    ])
  }, { failKeys: new Set(['__undoStack']) });
  const { context, alerts } = loadApp({ storage });

  assert.doesNotThrow(() => context.updateRow(1, 0, 'expense', 'Bread'));

  const saved = JSON.parse(storage.getItem('budget_2026_6'));
  assert.equal(saved[1].rows[0].expense, 'Bread');
  assert.ok(alerts.some(a => /undo/i.test(a) && /storage/i.test(a)), 'expected an undo-history warning to be shown');
});

test('undo and redo run without throwing and revert/reapply correctly', () => {
  const storage = createStorage({
    lastViewedMonth: JSON.stringify({ year: 2026, month: 6 }),
    budget_2026_6: JSON.stringify([
      { name: 'Income', colour: '#e5e5ea', isIncome: true, rows: [{ expense: 'Salary', cost: '100', paid: false, mode: 'fully-paid', runningTotal: '' }] },
      { name: 'Food', colour: '#FF6B6B', isIncome: false, rows: [{ expense: 'Milk', cost: '10', paid: false, mode: 'fully-paid', runningTotal: '' }] }
    ])
  });
  const { context, alerts } = loadApp({ storage });

  context.updateRow(1, 0, 'expense', 'Bread');
  assert.doesNotThrow(() => context.undoLastAction());
  assert.equal(JSON.parse(storage.getItem('budget_2026_6'))[1].rows[0].expense, 'Milk');

  assert.doesNotThrow(() => context.redoLastAction());
  assert.equal(JSON.parse(storage.getItem('budget_2026_6'))[1].rows[0].expense, 'Bread');

  assert.ok(alerts.some(a => a.startsWith('Undone:')));
  assert.ok(alerts.some(a => a.startsWith('Redone:')));
});

test('removing the last row in a category is rejected with feedback instead of doing nothing', () => {
  const storage = createStorage({
    lastViewedMonth: JSON.stringify({ year: 2026, month: 6 }),
    budget_2026_6: JSON.stringify([
      { name: 'Income', colour: '#e5e5ea', isIncome: true, rows: [{ expense: 'Salary', cost: '100', paid: false, mode: 'fully-paid', runningTotal: '' }] },
      { name: 'Food', colour: '#FF6B6B', isIncome: false, rows: [{ expense: 'Milk', cost: '10', paid: false, mode: 'fully-paid', runningTotal: '' }] }
    ])
  });
  const { context, alerts } = loadApp({ storage });

  assert.doesNotThrow(() => context.removeRow(1, 0));

  const saved = JSON.parse(storage.getItem('budget_2026_6'));
  assert.equal(saved[1].rows.length, 1, 'the only row must not be removed');
  assert.ok(alerts.some(a => /last row/i.test(a)));
});

test('importing budget history only writes recognised keys, skipping foreign/dangerous ones', () => {
  const storage = createStorage({
    lastViewedMonth: JSON.stringify({ year: 2026, month: 6 }),
    budget_2026_6: JSON.stringify([{ name: 'Income', colour: '#e5e5ea', isIncome: true, rows: [{ expense: '', cost: '', paid: false, mode: 'fully-paid', runningTotal: '' }] }])
  });
  const app = loadApp({ storage, confirmReturns: true });
  const { alerts } = app;

  const payload = {
    version: 1,
    type: 'history',
    entries: {
      budget_2027_0: [{ name: 'Income', colour: '#e5e5ea', isIncome: true, rows: [{ expense: 'New', cost: '5', paid: false, mode: 'fully-paid', runningTotal: '' }] }],
      __undoStack: [{ desc: 'malicious', snapshot: {} }],
      evil_key: 'not budget data'
    }
  };

  importFile(app, 'history', JSON.stringify(payload));

  assert.equal(storage.getItem('budget_2027_0'), JSON.stringify(payload.entries.budget_2027_0));
  assert.equal(storage.getItem('evil_key'), null, 'non budget_/protected_ keys must never be imported');
  assert.equal(storage.getItem('__undoStack'), null, 'undo/redo stacks must never be imported');
  assert.ok(alerts.some(a => /skipped/i.test(a)));
});

test('a category colour that is not a valid hex value is sanitized on load, not rendered raw', () => {
  const maliciousColour = '"><script>alert(1)</script>';
  const storage = createStorage({
    lastViewedMonth: JSON.stringify({ year: 2026, month: 6 }),
    budget_2026_6: JSON.stringify([
      { name: 'Income', colour: '#e5e5ea', isIncome: true, rows: [{ expense: '', cost: '', paid: false, mode: 'fully-paid', runningTotal: '' }] },
      { name: 'Food', colour: maliciousColour, isIncome: false, rows: [{ expense: '', cost: '', paid: false, mode: 'fully-paid', runningTotal: '' }] }
    ])
  });
  const { document } = loadApp({ storage });

  const html = document.getElementById('budgetContent').innerHTML;
  assert.ok(!html.includes(maliciousColour), 'malicious colour value must not reach the rendered HTML');
  assert.ok(!html.includes('<script>alert'));
});

test('cost and running total values are HTML-escaped when rendered', () => {
  const storage = createStorage({
    lastViewedMonth: JSON.stringify({ year: 2026, month: 6 }),
    budget_2026_6: JSON.stringify([
      { name: 'Income', colour: '#e5e5ea', isIncome: true, rows: [{ expense: '', cost: '', paid: false, mode: 'fully-paid', runningTotal: '' }] },
      { name: 'Food', colour: '#FF6B6B', isIncome: false, rows: [
        { expense: 'Bad', cost: '1" onmouseover="alert(1)', paid: false, mode: 'running-total', runningTotal: '2" onfocus="alert(2)' }
      ] }
    ])
  });
  const { document } = loadApp({ storage });

  const html = document.getElementById('budgetContent').innerHTML;
  assert.ok(!html.includes('onmouseover="alert(1)"'));
  assert.ok(!html.includes('onfocus="alert(2)"'));
});

test('service worker update handling does not throw when reg.installing is already null', async () => {
  let updatefoundHandler = null;
  const fakeReg = {
    installing: null,
    waiting: { addEventListener() {} },
    addEventListener(event, cb) { if (event === 'updatefound') updatefoundHandler = cb; },
    update() {}
  };
  const storage = createStorage({});
  const { document } = createDom();
  const context = vm.createContext({
    console,
    window: {},
    document,
    navigator: {
      serviceWorker: {
        register() { return Promise.resolve(fakeReg); },
        getRegistration() { return Promise.resolve(null); }
      },
      storage: { persist() { return Promise.resolve(false); }, persisted() { return Promise.resolve(false); } }
    },
    localStorage: storage,
    alert() {}, confirm() { return true; }, prompt() { return null; },
    fetch() { return Promise.reject(new Error('fetch disabled in tests')); },
    URL: { createObjectURL() { return 'blob://test'; }, revokeObjectURL() {} },
    Blob: class Blob {},
    FileReader: class FileReader { readAsText() {} set onload(v) { v({ target: { result: '{}' } }); } },
    setTimeout, clearTimeout, Date, Math, JSON, parseFloat, parseInt,
    Array, Object, String, Number, Promise, RegExp, Boolean, Error
  });

  vm.runInContext(APP_SOURCE, context, { filename: 'app.js' });

  // Registration resolves asynchronously — flush the microtask queue so the
  // updatefound listener is actually attached before we invoke it
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.ok(updatefoundHandler, 'expected an updatefound listener to have been registered');
  assert.doesNotThrow(() => updatefoundHandler());
});

test('the menu displays the baked-in app version immediately, with no "Loading..." placeholder', () => {
  const storage = createStorage({
    lastViewedMonth: JSON.stringify({ year: 2026, month: 6 }),
    budget_2026_6: JSON.stringify([{ name: 'Income', colour: '#e5e5ea', isIncome: true, rows: [{ expense: '', cost: '', paid: false, mode: 'fully-paid', runningTotal: '' }] }])
  });
  const { context, document } = loadApp({ storage });

  context.openMainMenu();

  const html = document.getElementById('bottomSheet').innerHTML;
  assert.ok(/Version \d+\.\d+\.\d+/.test(html), 'expected a bare "Version X.Y.Z" with no leading v and no placeholder text');
  assert.ok(!html.includes('Loading...'));
});

// Note on these update-check tests: app.js runs checkForAppUpdate() itself,
// automatically, at boot (renderApp() -> checkForAppUpdate(), the last line
// of app.js) — that call is already in flight by the time loadApp() returns,
// as fetch call #1. Rather than fight that with timing assumptions, each
// test either uses the boot call itself as "the first check" (it's a
// perfectly real stand-in — that's literally the cold-start scenario the fix
// targets), or uses fetchVersionPayload as a function keyed by call number
// to give the boot call a non-event (matching version) and reserve the
// mismatch for calls the test makes explicitly.

test('checkForAppUpdate prompts on the very first check if the remote version differs (no silent baseline-learning)', async () => {
  const storage = createStorage({});
  // No explicit checkForAppUpdate() call here at all — the boot-time call
  // IS the first-ever check, and is exactly the cold-start case this fixes:
  // the old implementation used to silently learn '9.9.9' as its baseline
  // on this very call and never prompt.
  const { reloads, confirms } = loadApp({
    storage,
    confirmReturns: true,
    fetchVersionPayload: { version: '9.9.9' }
  });
  await flushMicrotasks();

  assert.equal(confirms.length, 1, 'expected exactly one confirm() prompt');
  assert.ok(confirms[0].includes('9.9.9'));
  assert.equal(reloads.length, 1, 'expected a reload once the (no-op) service worker handoff completed');
});

test('checkForAppUpdate does not prompt when the remote version matches the running bundle', async () => {
  const storage = createStorage({});
  const { confirms } = loadApp({ storage, fetchVersionPayload: { version: RUNNING_VERSION } });
  await flushMicrotasks();

  assert.equal(confirms.length, 0, 'no update available — must not prompt');
});

test('a mismatch detected by both the service worker and the version check only prompts once', async () => {
  const storage = createStorage({});
  // fetchVersionPayload gives the automatic boot-time check (call #1) a
  // non-event so it can't race the explicit simulation below, then a real
  // mismatch for any later call.
  const { context, confirms } = loadApp({
    storage,
    confirmReturns: true,
    fetchVersionPayload: (callNum) => ({ version: callNum === 1 ? RUNNING_VERSION : '9.9.9' })
  });

  // Simulates the service worker's own updatefound/statechange path noticing
  // a deploy independently of the version.json check below
  context.promptForReload('9.9.9', null);
  // A later version.json check discovering the SAME update must not show a
  // second dialog on top of the one just shown above
  await context.checkForAppUpdate();
  await flushMicrotasks();

  assert.equal(confirms.length, 1, 'the second detection of the same update must not show a second dialog');
});

test('declining the reload prompt allows a later check to prompt again', () => {
  // Drives promptForReload directly rather than through checkForAppUpdate(),
  // so this test has nothing to do with fetch or the automatic boot-time
  // check at all — no fetchVersionPayload is given, so that boot call's
  // fetch() rejects immediately and its .catch() is a silent no-op,
  // regardless of timing. That isolates this test to exactly the thing it's
  // meant to verify: does declining reset the dedup flag for next time?
  const answers = [false, true];
  const { context, confirms } = loadApp({
    storage: createStorage({}),
    confirmReturns: () => answers.shift()
  });

  context.promptForReload('9.9.9', null); // declined
  context.promptForReload('9.9.9', null); // a later detection of the same (or a further) update

  assert.equal(confirms.length, 2, 'declining must reset the flag so a later detection can prompt again');
});

test('confirming a reload waits for the service worker to actually activate before reloading', async () => {
  const fakeWaitingWorker = { postedMessages: [], postMessage(msg) { this.postedMessages.push(msg); } };
  const storage = createStorage({});
  // No explicit checkForAppUpdate() call — the automatic boot-time check
  // (fetch call #1) is itself the mismatch detection under test here.
  const { reloads, swListeners } = loadApp({
    storage,
    confirmReturns: true,
    fetchVersionPayload: { version: '9.9.9' },
    registrationOverride: { waiting: fakeWaitingWorker }
  });
  await flushMicrotasks();

  assert.deepEqual(fakeWaitingWorker.postedMessages, ['SKIP_WAITING'], 'expected the waiting worker to be told to activate');
  assert.equal(reloads.length, 0, 'must not reload before the new worker has actually taken control');

  // Simulate the new worker finishing activation and taking over
  assert.ok(swListeners.controllerchange && swListeners.controllerchange.length > 0, 'expected a controllerchange listener to have been registered');
  swListeners.controllerchange.forEach(cb => cb());

  assert.equal(reloads.length, 1, 'expected exactly one reload once control actually changed');
});
