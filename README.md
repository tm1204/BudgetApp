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

The app will appear on your home screen and run in full-screen mode like a native app. When a new version is deployed, the app will automatically prompt you to refresh, checking every time the app becomes visible.

---

## ✨ Features

### 💼 Budget Management
- **Sticky header** — app title, year selector, and month tabs remain visible while scrolling
- **Year selector** — top right, covers current year + 4 years ahead
- **Monthly tabs** — one tab per month, January through December
- **Remembers last viewed month** — reopening the app (e.g. after being minimized) returns you to whichever month/year you last had open, rather than resetting to today's month
- **Auto-scroll to current tab** — the active month tab is automatically scrolled into view, aligned to the left edge of the month scroll bar
- **Summary bar** — always-visible totals for Income, Total Expenses, Balance and In Account
- **In Account** — Income minus only paid expenses, giving a real-time view of actual cash position

### 🗂️ Categories
- **8 default categories** — Income, Tithes, Home, Vehicles, Debits, Food, Fuel, Entertainment
- **Add custom categories** — via the "+ Add Category" button at the bottom of the list
- **Rename categories** — via the ⋯ menu on each category header (Income excluded)
- **Delete categories** — via the ⋯ menu with confirmation prompt (Income excluded)
- **Reorder categories** — Move Up / Move Down via the ⋯ menu; Income is permanently locked to the top position and no category can be moved above position 2
- **Category colours** — each category has a selectable colour from a 16-colour palette, applied to the section header and pie chart; Income has its own fixed selectable colour separate from the expense palette
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

### 📖 Main Menu
Accessed by tapping the **BudgetApp** name/icon in the top left, a dropdown trigger button:
- **Export** — Export Current Month As Template, or Export Entire Budget History
- **Import** — Import a Single Month Template, or Import Budget History
- **Permissions** — view and request Persistent Storage status
- **Undo** — reverts the most recent action, shows count of available undos
- **Redo** — reapplies the most recently undone action, shows count of available redos
- Export, Import, Permissions, Undo, Redo, and Rename now use minimal bold line-style SVG icons for a cleaner, more modern look, distinct from the app's colourful rounded icon

### 📤 Export / Import
- **Export Current Month As Template** — downloads a JSON file containing the current month's categories, rows, and protection status
- **Export Entire Budget History** — downloads a JSON file containing all saved months and protection flags across all years (undo/redo history excluded)
- **Import a Single Month Template** — overwrites the currently selected month only, with confirmation prompt
- **Import Budget History** — overwrites all matching saved months/settings from the file, with confirmation prompt
- All imports are recorded on the Undo stack

### ↩️ Undo / Redo
- Covers all mutating actions: row edits, add/remove row, category rename/colour/move/delete/add, Set as Template, protection toggle, and imports
- Stores the last **10 actions**
- Undo stack is cleared of redo history whenever a new action is performed after an undo (standard undo/redo behaviour)
- Persists across page refresh — stored in localStorage
- Each undo/redo shows a plain-language description of the action reverted or reapplied

### 🔐 Persistent Storage
- App automatically requests persistent storage permission from the browser on load, reducing the chance of iOS automatically clearing budget data during storage cleanup
- Permissions menu shows live Granted / Not Granted status
- "Request" button available if not yet granted
- Does not protect against manually clearing Safari website data — use Export for a true backup

### 🔄 Auto-Update
- Service worker caches all app assets for offline use
- `updateViaCache: 'none'` ensures the browser's HTTP cache never serves a stale service worker file
- Checks for updates every time the app becomes visible
- Prompts user to refresh when a new version is available

---

## 🗂️ Project Structure

    BudgetApp/
    ├── index.html          # App shell, meta tags, PWA configuration, sticky header
    ├── style.css           # All styling — layout, components, sheets, sticky positioning
    ├── app.js              # All app logic, data management, undo/redo, export/import, rendering
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
| __undoStack | Last 10 undo snapshots |
| __redoStack | Last 10 redo snapshots |
| lastViewedMonth | The last month/year tab that was open — used to restore your place when reopening the app |

⚠️ Clearing Safari's website data will erase all budget entries, undo/redo history, and the remembered last-viewed month. Use Export regularly for a true backup, and grant Persistent Storage permission via the Permissions menu to reduce automatic data loss.

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

New categories automatically cycle through the palette in order, skipping colours already in use. Income's colour is independently selectable and defaults to a fixed light grey (#e5e5ea), kept separate from the expense palette.

---

## 🖼️ Menu Icon Style

Export, Import, Permissions, Undo, Redo, and Rename use minimal, bold, black line-style inline SVG icons — a deliberately different visual language from the app's colourful rounded main icon, keeping the day-to-day interface clean and modern. Change Colour, Move Up, Move Down, and Delete remain as simple emoji/text glyphs, with Delete kept in red as a destructive-action cue.

---

## 🚀 Versioning & Updates

When deploying a new version, update the cache name in both sw.js and app.js:

    const CACHE_NAME = 'budget-app-v4.4';

Change this string with every release. This triggers the service worker to clear old caches and prompt users to refresh. Recommended versioning convention:

| Change Type | Example |
|---|---|
| Major new features | budget-app-v5.0 |
| Minor additions | budget-app-v4.5 |
| Bug fixes | budget-app-v4.4.1 |

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
| v4.1 | Bug fix — icon path corrected (Icons folder casing), Income isIncome flag enforced on load to fix legacy data being treated as an expense |
| v4.2 | Bug fix — Move Up disabled at position 2, hard block preventing any category from occupying Income's position 1, isIncome re-enforced after every category move |
| v4.3 | Main menu system (Export, Import, Permissions, Undo, Redo) accessed via app name button, Export Current Month/Full History, Import Month/History, Persistent Storage request and status, full Undo/Redo covering all actions (10-deep, persisted), sticky header while scrolling |
| v4.3.1 | Bug fix — service worker registered with updateViaCache: 'none' and forced update() call to fix update prompts not firing reliably due to browser HTTP caching of sw.js |
| v4.4 | Minimal bold line-style SVG icons for Export, Import, Permissions, Undo, Redo, and Rename; app now remembers and restores the last viewed month/year on reopen; active month tab automatically scrolls to the left edge of the month scroll bar |

---

## 🛠️ Built With

- HTML5
- CSS3 (CSS Grid, custom properties, sticky positioning, transitions)
- Vanilla JavaScript (ES6+)
- Web Storage API (localStorage)
- Service Worker API
- Web App Manifest (PWA)
- Storage Manager API (persistent storage)
- SVG (pie chart rendering, minimal line icons)
- Blob / File API (export and import)