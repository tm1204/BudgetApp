const CACHE_NAME = 'budget-app-v4.2';
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({length: 5}, (_, i) => CURRENT_YEAR + i);

const INCOME_COLOUR = '#e5e5ea';

const PALETTE = [
  '#FF6B6B', '#2ECC71', '#3498DB', '#9B59B6',
  '#FF9F43', '#1ABC9C', '#FF6EB4', '#F39C12',
  '#5C6BC0', '#A3CB38', '#E84393', '#4A90D9',
  '#6D9E73', '#A0522D', '#708090', '#F1C40F'
];

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

// ── Service Worker ──────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(reg => {
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
  });
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    navigator.serviceWorker.getRegistration().then(reg => { if (reg) reg.update(); });
  }
});

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

function getNextColour(data) {
  const usedColours = data.map(c => c.colour);
  for (let i = 0; i < PALETTE.length; i++) {
    if (!usedColours.includes(PALETTE[i])) return PALETTE[i];
  }
  return PALETTE[data.length % PALETTE.length];
}

// ── Data ────────────────────────────────────────────────────────────────────
function loadData(year, month) {
  const raw = localStorage.getItem(storageKey(year, month));
  if (raw) {
    const parsed = JSON.parse(raw);
    // Enforce isIncome on index 0 — fixes data saved before v4.0
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
  setProtected(year, month, true);
  renderMonthTabs();
  renderActionBar();
}

// ── Template ────────────────────────────────────────────────────────────────
function setAsTemplate() {
  if (!confirm(`Copy ${MONTHS[currentMonth]} ${currentYear} to all unprotected following months?`)) return;
  const data = loadData(currentYear, currentMonth);
  let count = 0;

  for (let m = currentMonth + 1; m < 12; m++) {
    if (!isProtected(currentYear, m)) {
      localStorage.setItem(storageKey(currentYear, m), JSON.stringify(
        data.map(cat => ({ ...cat, rows: cat.rows.map(r => ({ expense: r.expense, cost: r.cost, paid: false })) }))
      ));
      count++;
    }
  }
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
}

function toggleProtection() {
  setProtected(currentYear, currentMonth, !isProtected(currentYear, currentMonth));
  renderMonthTabs();
  renderActionBar();
}

// ── Bottom Sheet ─────────────────────────────────────────────────────────────
function openSheet(html) {
  document.getElementById('bottomSheet').innerHTML = html;
  document.getElementById('bottomSheet').classList.add('open');
  document.getElementById('sheetOverlay').classList.add('open');
}

function closeSheet() {
  document.getElementById('bottomSheet').classList.remove('open');
  document.getElementById('sheetOverlay').classList.remove('open');
}

function openCategoryMenu(catIdx) {
  const data    = loadData(currentYear, currentMonth);
  const cat     = data[catIdx];
  const isInc   = cat.isIncome;
  // Move Up disabled if income, or if already at index 1 (directly below income)
  const disableUp   = isInc || catIdx <= 1;
  const disableDown = isInc || catIdx === data.length - 1;

  const html = `
    <div class="sheet-handle"></div>
    <div class="sheet-title">${cat.name}</div>

    <button class="sheet-option ${isInc ? 'disabled' : ''}"
      onclick="${isInc ? '' : `sheetRename(${catIdx})`}">
      <span class="sheet-option-icon">✏️</span> Rename
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
  const name = prompt('Rename category:', data[catIdx].name);
  if (name && name.trim()) {
    data[catIdx].name = name.trim();
    saveData(currentYear, currentMonth, data);
    renderBudget();
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
  data[catIdx].colour = colour;
  saveData(currentYear, currentMonth, data);
  closeSheet();
  renderBudget();
}

function sheetMove(catIdx, direction) {
  const data   = loadData(currentYear, currentMonth);
  const newIdx = catIdx + direction;

  // Never move out of bounds
  if (newIdx < 0 || newIdx >= data.length) { closeSheet(); return; }

  // Income never moves
  if (data[catIdx].isIncome) { closeSheet(); return; }

  // No category can move into index 0 — Income's permanent position
  if (newIdx === 0) { closeSheet(); return; }

  [data[catIdx], data[newIdx]] = [data[newIdx], data[catIdx]];

  // Re-enforce isIncome by index as a final safety net
  data.forEach((cat, idx) => { cat.isIncome = idx === 0; });

  saveData(currentYear, currentMonth, data);
  closeSheet();
  renderBudget();
}

function sheetDelete(catIdx) {
  const data = loadData(currentYear, currentMonth);
  if (data[catIdx].isIncome) { closeSheet(); return; }
  if (!confirm(`Delete "${data[catIdx].name}"? This cannot be undone.`)) { closeSheet(); return; }
  data.splice(catIdx, 1);
  saveData(currentYear, currentMonth, data);
  closeSheet();
  renderBudget();
}

function addCategory() {
  const name = prompt('New category name:');
  if (!name || !name.trim()) return;
  const data   = loadData(currentYear, currentMonth);
  const colour = getNextColour(data);
  data.push({ name: name.trim(), colour, isIncome: false, rows: [{ expense: '', cost: '', paid: false }] });
  saveData(currentYear, currentMonth, data);
  renderBudget();
}

// ── Pie Chart ────────────────────────────────────────────────────────────────
function renderChart(data) {
  const expenses = data.filter(c => !c.isIncome);
  const totals   = expenses.map(c => c.rows.reduce((s, r) => s + (parseFloat(r.cost) || 0), 0));
  const total    = totals.reduce((a, b) => a + b, 0);

  if (total === 0) return '';

  const size   = 160;
  const cx     = size / 2;
  const cy     = size / 2;
  const radius = 60;
  const inner  = 30;

  let slices = '';
  let angle  = -Math.PI / 2;

  expenses.forEach((cat, i) => {
    const pct   = totals[i] / total;
    if (pct === 0) return;
    const sweep = pct * 2 * Math.PI;
    const x1    = cx + radius * Math.cos(angle);
    const y1    = cy + radius * Math.sin(angle);
    angle      += sweep;
    const x2    = cx + radius * Math.cos(angle);
    const y2    = cy + radius * Math.sin(angle);
    const ix1   = cx + inner * Math.cos(angle - sweep);
    const iy1   = cy + inner * Math.sin(angle - sweep);
    const ix2   = cx + inner * Math.cos(angle);
    const iy2   = cy + inner * Math.sin(angle);
    const large = sweep > Math.PI ? 1 : 0;

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

// ── Formatting ───────────────────────────────────────────────────────────────
function fmt(val) {
  return 'R ' + Math.abs(val).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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
  return { income, totalExpenses, paidExpenses, balance: income - totalExpenses, inAccount: income - paidExpenses };
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
  sel.onchange = () => { currentYear = parseInt(sel.value); renderMonthTabs(); renderBudget(); renderActionBar(); };
}

function renderMonthTabs() {
  const tabs = document.getElementById('monthTabs');
  tabs.innerHTML = MONTHS.map((m, i) => {
    const locked = isProtected(currentYear, i);
    return `<button class="${i === currentMonth ? 'active' : ''}" onclick="switchMonth(${i})">
      ${m}${locked ? ' 🔒' : ''}
    </button>`;
  }).join('');
}

function switchMonth(m) {
  currentMonth = m;
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

    if (cat.isIncome) runningRemaining = income;

    html += `<button class="add-btn" onclick="addRow(${catIdx})">+ Add row</button></div>`;
  });

  html += renderChart(data);
  html += `<button class="add-category-btn" onclick="addCategory()">+ Add Category</button>`;

  document.getElementById('budgetContent').innerHTML = html;
}

function updateRow(catIdx, rowIdx, field, value) {
  const data = loadData(currentYear, currentMonth);
  data[catIdx].rows[rowIdx][field] = value;
  saveData(currentYear, currentMonth, data);
  renderBudget();
}

function addRow(catIdx) {
  const data = loadData(currentYear, currentMonth);
  data[catIdx].rows.push({ expense: '', cost: '', paid: false });
  saveData(currentYear, currentMonth, data);
  renderBudget();
}

function removeRow(catIdx, rowIdx) {
  const data = loadData(currentYear, currentMonth);
  if (data[catIdx].rows.length > 1) {
    data[catIdx].rows.splice(rowIdx, 1);
    saveData(currentYear, currentMonth, data);
    renderBudget();
  }
}

renderApp();