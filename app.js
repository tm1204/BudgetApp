const CATEGORIES = ['Income', 'Tithes', 'Home', 'Vehicles', 'Debits', 'Food', 'Fuel', 'Entertainment'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({length: 5}, (_, i) => CURRENT_YEAR + i);

let currentYear = CURRENT_YEAR;
let currentMonth = new Date().getMonth();

function storageKey(year, month) {
  return `budget_${year}_${month}`;
}

function loadData(year, month) {
  const raw = localStorage.getItem(storageKey(year, month));
  if (raw) return JSON.parse(raw);
  if (month > 0) {
    const prev = loadData(year, month - 1);
    if (prev) {
      return prev.map(cat => ({
        ...cat,
        rows: cat.rows.map(r => ({ expense: r.expense, cost: '', paid: false }))
      }));
    }
  }
  return CATEGORIES.map(name => ({ name, rows: [{ expense: '', cost: '', paid: false }] }));
}

function saveData(year, month, data) {
  localStorage.setItem(storageKey(year, month), JSON.stringify(data));
  for (let m = month + 1; m < 12; m++) {
    const futureKey = storageKey(year, m);
    const futureRaw = localStorage.getItem(futureKey);
    if (!futureRaw || JSON.parse(futureRaw).__inherited) {
      const inherited = data.map(cat => ({
        ...cat,
        rows: cat.rows.map(r => ({ expense: r.expense, cost: '', paid: false })),
        __inherited: true
      }));
      localStorage.setItem(futureKey, JSON.stringify(inherited));
    }
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
  const inAccountCls = 'in-account';

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
        <span class="value ${inAccountCls}">${fmt(inAccount)}</span>
      </div>
    </div>`;

  // Calculate running remaining across all categories
  let runningRemaining = income;

  data.forEach((cat, catIdx) => {
    // Section total
    const sectionTotal = cat.rows.reduce((sum, r) => sum + (parseFloat(r.cost) || 0), 0);

    html += `<div class="section">
      <div class="section-header">
        <span>${cat.name}</span>
        <span class="section-total">${fmt(sectionTotal)}</span>
      </div>
      <div class="col-headers">
        <span>Expense</span>
        <span>Cost</span>
        <span>Remaining</span>
        <span style="text-align:center">Paid</span>
        <span></span>
      </div>`;

    cat.rows.forEach((row, rowIdx) => {
      const cost = parseFloat(row.cost) || 0;

      let remVal, remDisplay, remCls;

      if (catIdx === 0) {
        // Income rows — remaining just shows the value itself
        remVal = cost;
        remDisplay = fmt(cost);
        remCls = 'positive';
      } else {
        runningRemaining -= cost;
        remVal = runningRemaining;
        remDisplay = (remVal < 0 ? '-' : '') + fmt(remVal);
        remCls = remVal >= 0 ? 'positive' : 'negative';
      }

      const checkedAttr = row.paid ? 'checked' : '';

      html += `<div class="budget-row">
        <input type="text" placeholder="Expense name" value="${row.expense.replace(/"/g, '&quot;')}"
          onchange="updateRow(${catIdx},${rowIdx},'expense',this.value)" />
        <input type="number" placeholder="0.00" value="${row.cost}"
          onchange="updateRow(${catIdx},${rowIdx},'cost',this.value)" />
        <div class="remaining ${remCls}">${remDisplay}</div>
        <div class="paid-cell">
          <input type="checkbox" ${checkedAttr}
            onchange="updateRow(${catIdx},${rowIdx},'paid',this.checked)" />
        </div>
        <button class="remove-btn" onclick="removeRow(${catIdx},${rowIdx})">−</button>
      </div>`;
    });

    // Reset running remaining for income category (it doesn't deduct)
    if (catIdx === 0) {
      runningRemaining = income;
    }

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
