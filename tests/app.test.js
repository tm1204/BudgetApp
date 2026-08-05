const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); },
    clear() { store.clear(); },
    key(index) { return Array.from(store.keys())[index] ?? null; },
    get length() { return store.size; }
  };
}

function createDom() {
  const elements = new Map();
  const document = {
    body: {},
    addEventListener() {},
    createElement(tag) {
      if (tag === 'a') {
        return { click() {}, setAttribute() {} };
      }
      return {};
    },
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, { innerHTML: '', classList: { add() {}, remove() {} }, style: {}, value: '' });
      }
      return elements.get(id);
    }
  };
  return { document, elements };
}

test('renders budget safely when stored data is malformed', () => {
  const { document } = createDom();
  const storage = createStorage({
    lastViewedMonth: '{bad json',
    budget_2026_7: '{bad json'
  });

  const window = {};
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
    window,
    document,
    navigator,
    localStorage: storage,
    alert() {},
    confirm() { return true; },
    URL: { createObjectURL() { return 'blob://test'; }, revokeObjectURL() {} },
    Blob: class Blob {},
    FileReader: class FileReader {
      readAsText() {}
      set onload(value) { value({ target: { result: '{}' } }); }
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

  const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  vm.runInContext(source, context, { filename: 'app.js' });

  assert.ok(document.getElementById('budgetContent').innerHTML.includes('Income'));
  assert.ok(document.getElementById('budgetContent').innerHTML.includes('Budgeted Balance'));
});
