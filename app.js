const CACHE_NAME = 'budget-app-v3.2.0';
const CATEGORIES = ['Income', 'Tithes', 'Home', 'Vehicles', 'Debits', 'Food', 'Fuel', 'Entertainment'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({length: 5}, (_, i) => CURRENT_YEAR + i);

let currentYear = CURRENT_YEAR;
let currentMonth = new Date().getMonth();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          if (confirm('A new version of the app is available. Refresh now?')) {
            window.location.reload();
          }
        }
      });
    });
  });
}

function storageKey(year, month) {
  return `budget_${year}_${month}`;
}

function isPastMonth(year, month) {
  const now = new Date();
  return year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth());
}

function stripInherited(data) {
  return data.map(cat => {
    const { __inherited, ...rest } = cat;
    return rest;
  });
}

// Walk backwards up to 24 months to find nearest saved data
function findNearestSource(year, month) {
  let y = year;
  let m = month - 1;

  for (let i = 0; i < 24; i++) {
    if (m < 0) { m = 11; y--; }
    if (y < 2020) break;

    const raw = localStorage.getItem(storageKey(y, m));
    if (raw) {
      return stripInherited(JSON.parse(raw));
    }
    m--;
  }
  return null;
}

function loadData(year, month) {
  const raw = localStorage.getItem(storageKey(year, month));

  if (raw) {
    return stripInherited(JSON.parse(raw));
  }

  // Nothing saved — inherit from nearest past month
  const source = findNearestSource(year, month);
  if (source) {
    return source.map(cat => ({
      ...cat,
      rows: cat.rows.map(r => ({ expense: r.expense, cost: r.cost, paid: false }))
    }));
  }

  // Truly blank slate
  return CATEGORIES.map(name => ({ name, rows: [{ expense: '', cost: '', paid: false }] }));
}

function saveData(year, month, data) {
  // Save current month — no inherited flag
  localStorage.setItem(storageKey(year, month), JSON.stringify(data));

  // Only propagate forward from current or future months
  if (isPastMonth(year, month)) return;

  // Propagate to rest of same year
  for (let m = month + 1; m < 12; m++) {
    propagateToMonth(year, m, data);
  }
  // Propagate into future years
  for (let y = year + 1; y <= CURRENT_YEAR + 4; y++) {
    for (let m = 0; m < 12; m++) {
      propagateToMonth(y, m, data);
    }
  }
}

function propagateToMonth(year, month, sourceData) {
  const key = storageKey(year, month);
  const existing = localStorage.getItem(key);

  // Only overwrite if not manually edited
  if (!existing || JSON.parse(existing).__inherited) {
    const inherited = sourceData.map(cat => ({
      ...cat,
      rows: cat.rows.map(r => ({ expense: r.expense, cost: r.cost, paid: false })),
      __inherited: true
    }));
    localStorage.setItem(key, JSON.stringify(inherited));
  }
}

function fmt(val) {
  return 'R ' + Math.abs(val).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function calcSummary(data) {
  let income = 0, totalExpenses = 0, paidExpenses = 0;
  data.forEach((cat, i) => {
    cat.rows.forEach(r => {
      const val = parseFloat(r.cost) || 0;
      if (i === 0) {
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
    inAccount: income - paidExpenses
  };
}

function renderApp() {
  renderYearSelect();
  renderMonthTabs();
  renderBudget();
}

function renderYearSelect() {
  const sel = document.getElementById('yearSelect');
  sel.innerHTML = YEARS.map(y =>
    `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`
  ).join('');
  sel.onchange = () => { currentYear = parseInt(sel.value); renderMonthTabs(); renderBudget(); };
}

function renderMonthTabs() {
  const tabs = document.getElementById('monthTabs');
  tabs.innerHTML = MONTHS.map((m, i) =>
    `<button class="${i === currentMonth ? 'active' : ''}" onclick="switchMonth(${i})">${m}</button>`
  ).join('');
}

function switchMonth(m) {
  currentMonth = m;
  renderMonthTabs();
  renderBudget();
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

    html += `
    <div class="section">
      <div class="section-header">
        <span>${cat.name}</span>
        <span class="section-total">${fmt(sectionTotal)}</span>
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

      if (catIdx === 0) {
        remDisplay = fmt(cost);
        remCls = 'positive';
      } else {
        runningRemaining -= cost;
        remDisplay = (runningRemaining < 0 ? '-' : '') + fmt(runningRemaining);
        remCls = runningRemaining >= 0 ? 'positive' : 'negative';
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

    if (catIdx === 0) runningRemaining = income;

    html += `<button class="add-btn" onclick="addRow(${catIdx})">+ Add row</button></div>`;
  });

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