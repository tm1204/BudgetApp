# 💰 BudgetApp

A lightweight personal budgeting Progressive Web App (PWA) built with vanilla HTML, CSS, and JavaScript. Hosted on GitHub Pages and installable as a home screen app on iPhone.

---

## 🌐 Live App

https://tm1204.github.io/BudgetApp/

---

## 📱 Install on iPhone

1. Open the link above in **Safari**
2. Tap the **Share** button
3. Select **"Add to Home Screen"**
4. Tap **Add**

The app will appear on your home screen and run in full-screen mode like a native app. When a new version is deployed, the app will automatically prompt you to refresh.

---

## ✨ Features

### 💼 Budget Management
- **Year selector** — top right, covers current year + 4 years ahead
- **Monthly tabs** — one tab per month, January through December
- **Summary bar** — always-visible totals for Income, Total Expenses, Balance and In Account
- **In Account** — Income minus only paid expenses, giving a real-time view of actual cash position

### 🗂️ Categories
- **8 default categories** — Income, Tithes, Home, Vehicles, Debits, Food, Fuel, Entertainment
- **Add custom categories** — via the "+ Add Category" button at the bottom of the list
- **Rename categories** — via the ⋯ menu on each category header (Income excluded)
- **Delete categories** — via the ⋯ menu with confirmation prompt (Income excluded)
- **Reorder categories** — Move Up / Move Down via the ⋯ menu (Income always stays top)
- **Category colours** — each category has a selectable colour from a 16-colour palette, applied to the section header and pie chart
- **Section totals** — each category header displays the sum of all its rows on the right

### 📋 Rows
- **Add rows** — per category via the "+ Add row" button
- **Remove rows** — via the − button on each row
- **Expense name** — free text input
- **Cost** — numeric input
- **Remaining** — auto-calculated running balance after each expense deducted from income
- **Paid tickbox** — mark individual expenses as paid; affects the In Account total

### 🥧 Pie Chart
- Donut-style chart rendered below the last category
- Displays each expense category as a percentage of total expenses
- Uses each category's assigned colour
- Legend alongside chart showing category name and percentage
- Hidden until at least one expense value is entered
- Income excluded from chart

### 📅 Month Propagation
- **Set as Template** button — bottom left — copies current month's data (names + costs, paid boxes reset) to all unprotected following months across all years
- **Protected toggle** button — bottom right — manually lock or unlock a month
- **Auto-protect** — any manual edit to a month automatically protects it from being overwritten
- **🔒 indicator** — protected months show a lock icon on the month tab
- Propagation skips protected months but continues to unprotected months beyond them

### 🔄 Auto-Update
- Service worker caches all app assets for offline use
- Checks for updates every time the app becomes visible
- Prompts user to refresh when a new version is available

---

## 🗂️ Project Structure

    BudgetApp/
    ├── index.html          # App shell, meta tags, PWA configuration
    ├── style.css           # All styling — layout, components, animations
    ├── app.js              # All app logic, data management, rendering
    ├── sw.js               # Service worker — caching and update detection
    ├── manifest.json       # PWA manifest — icons, display mode, theme
    ├── README.md           # This file
    └── Icons/
        ├── icon-192.png    # App icon — home screen
        └── icon-512.png    # App icon — splash screen


---

## 💾 Data Storage

All budget data is stored in the browser's localStorage — no server, no account, no internet required after first load. Data persists across sessions and app restarts.

### Storage Keys

| Key | Contents |
|---|---|
| budget_{year}_{month} | Full category and row data for that month |
| protected_{year}_{month} | Protection flag for that month |

⚠️ Clearing Safari's website data will erase all budget entries. There is currently no export or backup feature.

---

## 🔄 Propagation Rules

| Scenario | Behaviour |
|---|---|
| Tap "Set as Template" | Copies current month to all unprotected future months across all years |
| Month is protected | Skipped by Set as Template — data preserved |
| Month is unprotected | Overwritten by Set as Template |
| Any manual edit made | Month is automatically protected immediately |
| Protected months beyond a skipped one | Still receive the template — propagation continues past protected months |
| Past months | Never propagated to regardless of protection status |

---

## 🎨 Category Colours

A curated palette of 16 colours is available for category headers and the pie chart:

| # | Colour | Hex |
|---|---|---|
| 1 | Coral Red | #FF6B6B |
| 2 | Emerald | #2ECC71 |
| 3 | Blue | #3498DB |
| 4 | Purple | #9B59B6 |
| 5 | Orange | #FF9F43 |
| 6 | Teal | #1ABC9C |
| 7 | Pink | #FF6EB4 |
| 8 | Amber | #F39C12 |
| 9 | Indigo | #5C6BC0 |
| 10 | Lime | #A3CB38 |
| 11 | Rose | #E84393 |
| 12 | Steel Blue | #4A90D9 |
| 13 | Sage | #6D9E73 |
| 14 | Brown | #A0522D |
| 15 | Slate | #708090 |
| 16 | Yellow | #F1C40F |

New categories automatically cycle through the palette in order, skipping colours already in use. Income is fixed at the default grey (#e5e5ea) and is not part of the selectable palette.

---

## 🚀 Versioning & Updates

When deploying a new version, update the cache name in both sw.js and app.js:

    const CACHE_NAME = 'budget-app-v4.0';

Change this string with every release. This triggers the service worker to clear old caches and prompt users to refresh. Recommended versioning convention:

| Change Type | Example |
|---|---|
| Major new features | budget-app-v5.0 |
| Minor additions | budget-app-v4.1 |
| Bug fixes | budget-app-v4.0.1 |

---

## 📋 Version History

| Version | Key Changes |
|---|---|
| v1.0 | Initial release — year selector, monthly tabs, 8 categories, add/remove rows, running remaining |
| v2.0 | Section totals in headers, wider expense column, paid tickboxes, In Account summary |
| v3.0 | Service worker added, column alignment fixed, expense column tripled |
| v3.1 | Smart month propagation, icons moved to /Icons folder |
| v3.2 | Propagation fix — load-time inheritance via findNearestSource |
| v3.3 | Propagation fix — cleanup of empty inherited placeholders written by old code |
| v3.4 | Replaced auto-propagation with Set as Template button, Protected toggle, auto-protect on edit, lock icons on tabs |
| v4.0 | App name and icon in header, category colours, ⋯ ellipsis menu (rename/colour/move/delete), add custom categories, donut pie chart, visibility-change update check |

---

## 🛠️ Built With

- HTML5
- CSS3 (CSS Grid, custom properties, transitions)
- Vanilla JavaScript (ES6+)
- Web Storage API (localStorage)
- Service Worker API
- Web App Manifest (PWA)
- SVG (pie chart rendering)        
