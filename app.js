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
  // Try to inherit from previous month
  if (month > 0) {
    const prev = loadData(year, month - 1);
    if (prev) {
      // Deep clone and clear cost values, keep expense names
      return prev.map(cat => ({
        ...cat,
        rows: cat.rows.map(r => ({ expense: r.expense, cost: '' }))
      }));
    }
  }
  return CATEGORIES.map(name => ({ name, rows: [{ expense: '', cost: '' }] }));
}

function saveData(year, month, data) {
  localStorage.setItem(storageKey(year, month), JSON.stringify(data));
  // Propagate expense names (not costs) to all future months that haven't been manually edited
  for (let m = month + 1; m < 12; m++) {
    const futureKey = storageKey(year, m);
    const futureRaw = localStorage.getItem(futureKey);
    // Only propagate if future month is still "inherited" (not manually saved)
    if (!futureRaw || JSON.parse(futureRaw).__inherited) {
      const inherited = data.map(cat => ({
        ...cat,
        rows: cat.rows.map(r => ({ expense: r.expense, cost: '' })),
        __inherited: true
      }));
      localStorage.setItem(futureKey, JSON.stringify(inherited));
    }
  }
}

function calcRemaining(data) {
  let income = 0, expenses = 0;
  data.forEach((cat, i) => {
    cat.rows.forEach(r => {
      const val = parseFloat(r.cost) || 0;
      if (i === 0) income += val; // Income category
      else expenses += val;
    });
  });
  return { income, expenses, remaining: income - expenses };
}

function renderApp() {
  renderYearSelect();
  renderMonthTabs();
  renderBudget();
}

function renderYearSelect() {
  const sel = document.getElementById('yearSelect');
  sel.innerHTML = YEARS.map(y => `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`).join('');
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
  const { income, expenses, remaining } = calcRemaining(data);
  const main = document.getElementById('budgetContent');

  const sign = remaining >= 0 ? '+' : '';
  const cls = remaining >= 0 ? 'positive' : 'negative';

  let html = `
    <div class="summary-bar">
      <div>Income: <span>R ${income.toLocaleString('en-ZA', {minimumFractionDigits:2})}</span></div>
      <div>Expenses: <span>R ${expenses.toLocaleString('en-ZA', {minimumFractionDigits:2})}</span></div>
      <div>Balance: <span class="${cls}">${sign}R ${remaining.toLocaleString('en-ZA', {minimumFractionDigits:2})}</span></div>
    </div>`;

  data.forEach((cat, catIdx) => {
    let runningRemaining = income;
    // Calculate running remaining up to this category
    for (let c = 0; c < catIdx; c++) {
      if (c > 0) data[c].rows.forEach(r => { runningRemaining -= (parseFloat(r.cost) || 0); });
    }

    html += `<div class="section">
      <div class="section-header">${cat.name}</div>
      <div class="col-headers"><span>Expense</span><span style="text-align:right">Cost</span><span style="text-align:right">Remaining</span><span></span></div>`;

    let sectionRunning = catIdx === 0 ? 0 : income;
    // Subtract all previous non-income categories
    for (let c = 1; c < catIdx; c++) {
      data[c].rows.forEach(r => { sectionRunning -= (parseFloat(r.cost) || 0); });
    }

    cat.rows.forEach((row, rowIdx) => {
      const cost = parseFloat(row.cost) || 0;
      if (catIdx > 0) sectionRunning -= cost;
      else sectionRunning = income; // income rows show total income as remaining

      const remVal = catIdx === 0 ? cost : sectionRunning;
      const remCls = remVal >= 0 ? 'positive' : 'negative';
      const remDisplay = catIdx === 0
        ? `R ${cost.toLocaleString('en-ZA', {minimumFractionDigits:2})}`
        : `R ${remVal.toLocaleString('en-ZA', {minimumFractionDigits:2})}`;

      html += `<div class="budget-row">
        <input type="text" placeholder="Expense name" value="${row.expense}" 
          onchange="updateRow(${catIdx},${rowIdx},'expense',this.value)" />
        <input type="number" placeholder="0.00" value="${row.cost}" 
          onchange="updateRow(${catIdx},${rowIdx},'cost',this.value)" />
        <div class="remaining ${remCls}">${remDisplay}</div>
        <button class="remove-btn" onclick="removeRow(${catIdx},${rowIdx})">−</button>
      </div>`;
    });

    html += `<button class="add-btn" onclick="addRow(${catIdx})">+ Add row</button></div>`;
  });

  main.innerHTML = html;
}

function updateRow(catIdx, rowIdx, field, value) {
  const data = loadData(currentYear, currentMonth);
  data[catIdx].rows[rowIdx][field] = value;
  saveData(currentYear, currentMonth, data);
  renderBudget();
}

function addRow(catIdx) {
  const data = loadData(currentYear, currentMonth);
  data[catIdx].rows.push({ expense: '', cost: '' });
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