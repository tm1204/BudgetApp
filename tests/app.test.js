const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const APP_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

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
function loadApp({ storage, confirmReturns = true, promptReturns = null } = {}) {
  const { document } = createDom();
  const alerts = [];
  const confirms = [];
  // app.js constructs its own `new FileReader()` internally, so the content
  // it should "read" can't be passed in as a constructor arg — this holder
  // is captured by closure and mutated by importFile() right before the call
  const fileContentHolder = { value: '{}' };

  const navigator = {
    serviceWorker: {
      register() { return Promise.resolve({ addEventListener() {}, update() {} }); },
      getRegistration() { return Promise.resolve(null); }
    },
    storage: {
      persist() { return Promise.resolve(false); },
      persisted() { return Promise.resolve(false); }
    }
  };

  const context = vm.createContext({
    console,
    window: {},
    document,
    navigator,
    localStorage: storage,
    alert(msg) { alerts.push(msg); },
    confirm(msg) { confirms.push(msg); return confirmReturns; },
    prompt() { return promptReturns; },
    // app.js fetches version.json on every render; stub it as an always-failing
    // network request (caught and ignored by checkForAppUpdate's .catch)
    fetch() { return Promise.reject(new Error('fetch disabled in tests')); },
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
  return { context, document, alerts, confirms, fileContentHolder };
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
