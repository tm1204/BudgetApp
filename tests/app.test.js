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

// Real Set-backed classList — app.js's toggleClass()/Escape-to-close code
// needs classList.toggle()/contains(), which a plain {add(){}, remove(){}}
// stub can't support.
function createClassList(initial = []) {
  const classes = new Set(initial);
  return {
    add(c) { classes.add(c); },
    remove(c) { classes.delete(c); },
    contains(c) { return classes.has(c); },
    toggle(c, force) {
      const shouldHave = force === undefined ? !classes.has(c) : force;
      if (shouldHave) classes.add(c); else classes.delete(c);
      return shouldHave;
    }
  };
}

// toasts, if given, collects every message written to the #toast element's
// textContent (showToast() replaced alert() for routine feedback — see
// loadApp below) — an array rather than a single value, since a test can
// trigger more than one toast (e.g. undo then redo) and needs the history,
// not just whatever is showing last.
function createDom(toasts = []) {
  const elements = new Map();
  const listeners = {};
  const document = {
    body: {},
    addEventListener(event, cb) { (listeners[event] = listeners[event] || []).push(cb); },
    createElement(tag) {
      if (tag === 'a') return { click() {}, setAttribute() {} };
      return {};
    },
    getElementById(id) {
      if (!elements.has(id)) {
        if (id === 'toast') {
          let text = '';
          elements.set(id, {
            classList: createClassList(),
            style: {},
            get textContent() { return text; },
            set textContent(v) { text = v; toasts.push(v); }
          });
        } else {
          elements.set(id, { innerHTML: '', classList: createClassList(), style: {}, value: '', click() {} });
        }
      }
      return elements.get(id);
    }
  };
  return { document, elements, listeners };
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
  const toasts = [];
  const { document, listeners } = createDom(toasts);
  const alerts = []; // kept for defensiveness, but app.js no longer calls alert() anywhere — see toasts
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
  return { context, document, alerts, confirms, fileContentHolder, reloads, swListeners, toasts, listeners };
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
  const { context, toasts } = loadApp({ storage });

  assert.doesNotThrow(() => context.updateRow(1, 0, 'expense', 'Bread'));

  // The write failed, so the previously persisted value must remain intact —
  // the edit must be visibly rejected, not silently discarded
  const saved = JSON.parse(storage.getItem('budget_2026_6'));
  assert.equal(saved[1].rows[0].expense, 'Milk');
  assert.ok(toasts.some(t => /storage is full/i.test(t)), 'expected a storage-full warning to be shown');
});

test('a full undo-stack quota still applies the edit, but warns undo is unavailable', () => {
  const storage = createStorage({
    lastViewedMonth: JSON.stringify({ year: 2026, month: 6 }),
    budget_2026_6: JSON.stringify([
      { name: 'Income', colour: '#e5e5ea', isIncome: true, rows: [{ expense: 'Salary', cost: '100', paid: false, mode: 'fully-paid', runningTotal: '' }] },
      { name: 'Food', colour: '#FF6B6B', isIncome: false, rows: [{ expense: 'Milk', cost: '10', paid: false, mode: 'fully-paid', runningTotal: '' }] }
    ])
  }, { failKeys: new Set(['__undoStack']) });
  const { context, toasts } = loadApp({ storage });

  assert.doesNotThrow(() => context.updateRow(1, 0, 'expense', 'Bread'));

  const saved = JSON.parse(storage.getItem('budget_2026_6'));
  assert.equal(saved[1].rows[0].expense, 'Bread');
  assert.ok(toasts.some(t => /undo/i.test(t) && /storage/i.test(t)), 'expected an undo-history warning to be shown');
});

test('undo and redo run without throwing and revert/reapply correctly', () => {
  const storage = createStorage({
    lastViewedMonth: JSON.stringify({ year: 2026, month: 6 }),
    budget_2026_6: JSON.stringify([
      { name: 'Income', colour: '#e5e5ea', isIncome: true, rows: [{ expense: 'Salary', cost: '100', paid: false, mode: 'fully-paid', runningTotal: '' }] },
      { name: 'Food', colour: '#FF6B6B', isIncome: false, rows: [{ expense: 'Milk', cost: '10', paid: false, mode: 'fully-paid', runningTotal: '' }] }
    ])
  });
  const { context, toasts } = loadApp({ storage });

  context.updateRow(1, 0, 'expense', 'Bread');
  assert.doesNotThrow(() => context.undoLastAction());
  assert.equal(JSON.parse(storage.getItem('budget_2026_6'))[1].rows[0].expense, 'Milk');

  assert.doesNotThrow(() => context.redoLastAction());
  assert.equal(JSON.parse(storage.getItem('budget_2026_6'))[1].rows[0].expense, 'Bread');

  assert.ok(toasts.some(t => t.startsWith('Undone:')));
  assert.ok(toasts.some(t => t.startsWith('Redone:')));
});

test('removing the last row in a category is rejected with feedback instead of doing nothing', () => {
  const storage = createStorage({
    lastViewedMonth: JSON.stringify({ year: 2026, month: 6 }),
    budget_2026_6: JSON.stringify([
      { name: 'Income', colour: '#e5e5ea', isIncome: true, rows: [{ expense: 'Salary', cost: '100', paid: false, mode: 'fully-paid', runningTotal: '' }] },
      { name: 'Food', colour: '#FF6B6B', isIncome: false, rows: [{ expense: 'Milk', cost: '10', paid: false, mode: 'fully-paid', runningTotal: '' }] }
    ])
  });
  const { context, toasts } = loadApp({ storage });

  assert.doesNotThrow(() => context.removeRow(1, 0));

  const saved = JSON.parse(storage.getItem('budget_2026_6'));
  assert.equal(saved[1].rows.length, 1, 'the only row must not be removed');
  assert.ok(toasts.some(t => /last row/i.test(t)));
});

test('importing budget history only writes recognised keys, skipping foreign/dangerous ones', () => {
  const storage = createStorage({
    lastViewedMonth: JSON.stringify({ year: 2026, month: 6 }),
    budget_2026_6: JSON.stringify([{ name: 'Income', colour: '#e5e5ea', isIncome: true, rows: [{ expense: '', cost: '', paid: false, mode: 'fully-paid', runningTotal: '' }] }])
  });
  const app = loadApp({ storage, confirmReturns: true });
  const { toasts } = app;

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
  assert.ok(toasts.some(t => /skipped/i.test(t)));
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
  assert.ok(/Version \d+\.\d+(\.\d+)?(?!\.)/.test(html), 'expected a bare version number with no leading v and no placeholder text');
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

test('editing a row value patches computed numbers without rebuilding the whole page', () => {
  const storage = createStorage({
    lastViewedMonth: JSON.stringify({ year: 2026, month: 6 }),
    budget_2026_6: JSON.stringify([
      { name: 'Income', colour: '#e5e5ea', isIncome: true, rows: [{ expense: 'Salary', cost: '100', paid: false, mode: 'fully-paid', runningTotal: '' }] },
      { name: 'Food', colour: '#FF6B6B', isIncome: false, rows: [{ expense: 'Milk', cost: '10', paid: false, mode: 'fully-paid', runningTotal: '' }] }
    ])
  });
  const { context, document } = loadApp({ storage });
  const budgetContentBefore = document.getElementById('budgetContent').innerHTML;

  context.updateRow(1, 0, 'cost', '20');

  // A successful edit must go through updateComputedValues(), not
  // renderBudget() — proven here by #budgetContent's innerHTML never being
  // touched at all, which is exactly what used to destroy and recreate
  // every input (and drop focus/keyboard) on every single field edit
  assert.equal(document.getElementById('budgetContent').innerHTML, budgetContentBefore);

  // ...while the actual computed numbers this edit affects were patched:
  // Remaining = income(100) - new cost(20) = 80, section total = 20
  assert.equal(document.getElementById('remaining-1-0').textContent, 'R 80.00');
  assert.equal(document.getElementById('section-total-1').textContent, 'R 20.00');
});

test('category header colour is fixed inline to just the background, not the text', () => {
  // pickTextColour() (per-category dark/light text) was removed — headers
  // now use one standard text colour (set in CSS on .section-header) for
  // every category, by request, rather than varying category to category.
  const storage = createStorage({
    lastViewedMonth: JSON.stringify({ year: 2026, month: 6 }),
    budget_2026_6: JSON.stringify([
      { name: 'Income', colour: '#e5e5ea', isIncome: true, rows: [{ expense: '', cost: '', paid: false, mode: 'fully-paid', runningTotal: '' }] },
      { name: 'Food', colour: '#A0522D', isIncome: false, rows: [{ expense: '', cost: '', paid: false, mode: 'fully-paid', runningTotal: '' }] }
    ])
  });
  const { document } = loadApp({ storage });

  const html = document.getElementById('budgetContent').innerHTML;
  assert.match(html, /style="background:#A0522D;"/, 'expected only a background colour inline, no per-category text colour');
});

test('pressing Escape closes an open bottom sheet, other keys do not', () => {
  const { context, document, listeners } = loadApp({ storage: createStorage({}) });

  context.openMainMenu();
  assert.ok(document.getElementById('bottomSheet').classList.contains('open'));
  assert.ok(listeners.keydown && listeners.keydown.length > 0, 'expected a keydown listener to be registered');

  listeners.keydown.forEach(cb => cb({ key: 'Enter' }));
  assert.ok(document.getElementById('bottomSheet').classList.contains('open'), 'a non-Escape key must not close the sheet');

  listeners.keydown.forEach(cb => cb({ key: 'Escape' }));
  assert.ok(!document.getElementById('bottomSheet').classList.contains('open'));
});

test('the bottom sheet markup declares itself as an accessible dialog', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /id="bottomSheet"[^>]*role="dialog"/);
  assert.match(html, /id="bottomSheet"[^>]*aria-modal="true"/);
});

test('index.html and manifest.json declare the iOS/PWA one-liners this release added', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));

  assert.match(html, /<meta name="mobile-web-app-capable" content="yes"\s*\/>/);
  assert.match(html, /<meta name="theme-color" content="#1c1c1e"\s*\/>/);
  assert.equal(manifest.orientation, 'portrait');
});

test('row expense/cost inputs have an explicit text colour instead of relying on browser default inheritance', () => {
  // Regression, distinct from the .row-ellipsis-btn one above: <input>
  // elements don't inherit `color` from the page by default in browsers,
  // unlike regular text — these two had no color property at all (not even
  // a wrong hardcoded one), so they silently rendered in the browser's
  // default text colour regardless of dark mode, while everything else
  // correctly followed the app's own light/dark colour.
  const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
  assert.match(css, /\.cell-expense input\[type="text"\]\s*\{[^}]*color:\s*inherit/);
  assert.match(css, /\.cell-cost input\[type="number"\]\s*\{[^}]*color:\s*inherit/);
});

test('every fixed dark/black text colour outside the category header is overridden in dark mode', () => {
  // Regression: .row-ellipsis-btn (the per-row ⋮ menu button) kept its
  // light-mode #3a3a3c text colour in dark mode, where .section's
  // background flips to #1c1c1e — nearly invisible, dark grey on near-black.
  // Rather than re-list every selector here (brittle — breaks on any
  // unrelated dark-mode edit), this greps the light-mode rules for the two
  // colours that are actually invisible against a dark card background and
  // asserts each one is also mentioned inside the dark-mode media query.
  // .section-header (#3a3a3c) is deliberately excluded: its contrast
  // depends on the category's own background colour, not the app's
  // light/dark theme, so the same fixed value is intentionally correct in
  // both modes rather than needing a dark-mode override.
  const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
  const darkModeIdx = css.indexOf('@media (prefers-color-scheme: dark)');
  assert.ok(darkModeIdx !== -1, 'expected a dark-mode media query block in style.css');
  const lightModeCss = css.slice(0, darkModeIdx);
  const darkModeCss = css.slice(darkModeIdx);

  const selectorsWithDarkText = [...lightModeCss.matchAll(/(\.[\w-]+|^body)\s*\{[^}]*color:\s*#(?:1c1c1e|3a3a3c)\b/gm)]
    .map(m => m[1])
    .filter(selector => selector !== '.section-header');

  assert.ok(selectorsWithDarkText.includes('.row-ellipsis-btn'), 'sanity check: the known-fixed selector should still be found by this scan');
  assert.ok(selectorsWithDarkText.includes('body'), 'sanity check: this scan should also catch bare-element selectors, not just .classes');
  selectorsWithDarkText.forEach(selector => {
    const escaped = selector.startsWith('.') ? '\\' + selector : selector;
    assert.match(darkModeCss, new RegExp(escaped + '\\b'), `${selector} has fixed dark text in light mode but no dark-mode override`);
  });
});
