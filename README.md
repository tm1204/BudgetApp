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
- **Summary bar** — always-visible totals for Income, Total Expenses, Budgeted Balance and In Account
- **Budgeted Balance** — Income minus total budgeted expenses
- **In Account** — Income minus actual cash outflow:
  - **Fully Paid** rows subtract full cost only when checked
  - **Running Total** rows subtract the entered running total amount

### 🗂️ Categories
- **8 default categories** — Income, Tithes, Home, Vehicles, Debits, Food, Fuel, Entertainment
- **Add custom categories** — via the "+ Add Category" button at the bottom of the list
- **Rename categories** — via the ⋮ menu on each category header (Income excluded)
- **Delete categories** — via the ⋮ menu with confirmation prompt (Income excluded)
- **Reorder categories** — Move Up / Move Down via the category menu; Income is permanently locked to the top position and no category can be moved above position 2
- **Category colours** — each category has a selectable colour from a 16-colour palette, applied to the section header and pie chart; Income has its own fixed selectable colour separate from the expense palette
- **Section totals** — each category header displays the sum of all its rows on the right
- **Consistent category ellipsis** — category heading menu now uses the same vertical ellipsis style as row menus

### 📋 Rows
- **Add rows** — per category via the "+ Add row" button
- **Row actions menu** — each row uses a **vertical ellipsis** menu instead of a direct remove button
- **Remove Row** — available from the row menu
- **Switch Row to Running Total** — available from the row menu for non-Income rows
- **Switch Row to Fully Paid** — available from the row menu for non-Income rows
- **Move Row Up / Down** — available from the row menu for reordering rows within a category
- **Income row menu** — only contains **Remove Row**
- **Expense name** — free text input
- **Cost** — numeric input
- **Remaining** — auto-calculated running balance after each row's effective budget impact is deducted from income
- **Status column** — right-aligned
- **Fully Paid mode** — row shows a right-aligned checkbox in the Status column
- **Running Total mode** — row shows a right-aligned numeric running-total input in the Status column
- **Over-budget visual warning** — running total text turns red when the entered running total exceeds the row's budgeted cost
- **Instant edits** — editing a row patches just the affected numbers (Remaining, section total, summary bar, chart) instead of rebuilding the whole page, so the keyboard/focus no longer drops when moving straight to the next field

### 🧮 Running Total Logic
Each row can operate in one of two modes:

#### Fully Paid
- Default mode for all new rows
- Uses the checkbox behavior already present in the app
- **Budget / Remaining impact** = budgeted cost
- **In Account impact** = full cost only when checked

#### Running Total
- Switched on via row menu
- Replaces the checkbox with a numeric input
- **Budget / Remaining impact** = greater of:
  - budgeted cost
  - entered running total
- **In Account impact** = entered running total amount
- If running total exceeds budgeted cost, the input text turns red

### 🥧 Pie Chart
- Donut-style chart rendered below the last category
- Displays each expense category as a percentage of total expenses
- Uses each category's assigned colour
- Legend alongside chart showing category name and percentage
- Hidden until at least one expense value is entered
- Income excluded from chart

### 🌗 Appearance
- **Dark mode** — follows the system/browser setting automatically (`prefers-color-scheme`), no in-app toggle
- **Category header text** — always black and bold, regardless of the category's own colour, for a consistent look across every category — the ⋮ menu button matches the same colour and weight

### ♿ Accessibility
- Bottom sheet is a proper dialog (`role="dialog"`, `aria-modal`) and can be dismissed with **Escape**, same as tapping the overlay
- Expense name, cost, paid, and running-total inputs all have accessible labels
- `orientation: portrait` locked in the manifest and `theme-color`/`mobile-web-app-capable` meta tags added — this is a phone-only, standalone-only layout

### 📅 Month Propagation
- **Set Current Month as Template** — now moved into the main menu
- Copies current month's data (names + costs, paid boxes reset, running totals reset) to all unprotected following months across all years
- **Current Month Protected / Unprotected** — now moved into the main menu
- **Auto-protect** — any manual edit to a month automatically protects it from being overwritten
- **🔒 indicator** — protected months show a lock icon on the month tab
- Propagation skips protected months but continues to unprotected months beyond them

### 📖 Main Menu
Accessed by tapping the **BudgetApp** name/icon in the top left, a dropdown trigger button:
- **Export**
- **Import**
- **App Permissions**
- **Set Current Month as Template**
- **Current Month Protected / Unprotected**
- **Undo**
- **Redo**
- App version shown as a **greyed-out line** at the bottom of the menu
- Export, Import, App Permissions, Undo, Redo, Protected/Unprotected, Set Current Month as Template, and Rename use consistent minimal bold line-style SVG icons aligned to the app’s modern minimal interface

### ⬅️ Submenu Navigation
- Submenus now include a **Back** button in the **top-left corner**
- Back returns to the previous menu instead of forcing the user to close and reopen the menu flow
- Export, Import, App Permissions, and Choose Colour all use this submenu back pattern
- Main menu actions now use the same back-style header layout, with no separate cancel button in the sheet body

### 📤 Export / Import
- **Export Current Month As Template** — downloads a JSON file containing the current month's categories, rows, protection status, row modes, paid state, and running total values
- **Export Entire Budget History** — downloads a JSON file containing all saved months and protection flags across all years (undo/redo history excluded)
- **Import a Single Month Template** — overwrites the currently selected month only, with confirmation prompt
- **Import Budget History** — overwrites all matching saved months/settings from the file, with confirmation prompt
- Only recognised app data keys (budget months and protection flags) are ever written by a history import — unrelated or unexpected entries in the file are skipped and reported, rather than being written to storage
- All imports are recorded on the Undo stack
- Export / Import submenu icons are aligned with the app’s existing line-icon theme

### ↩️ Undo / Redo
- Covers all mutating actions: row edits, add/remove row, row mode switches, category rename/colour/move/delete/add, Set Month as Template, Month Protected/Unprotected, and imports
- Stores the last **10 actions**
- Undo stack is cleared of redo history whenever a new action is performed after an undo (standard undo/redo behaviour)
- Persists across page refresh — stored in localStorage
- Each undo/redo shows a plain-language description of the action reverted or reapplied, as a brief toast rather than a blocking dialog

### 🔐 App Permissions
- Renamed from **Permissions** to **App Permissions**
- App automatically requests persistent storage permission from the browser on load, reducing the chance of iOS automatically clearing budget data during storage cleanup
- App Permissions menu shows live Granted / Not Granted status
- "Request" button available if not yet granted
- Does not protect against manually clearing Safari website data — use Export for a true backup

### 🔄 Auto-Update
- Service worker caches all app assets for offline use
- `updateViaCache: 'none'` ensures the browser's HTTP cache never serves a stale service worker file
- `version.json` is compared against the `APP_VERSION` baked into the running copy of `app.js` — not a value learned from the first check of the session, so a stale cached bundle is always detected, even on a cold start
- The service worker and the `version.json` check can both notice the same deploy independently, but only ever show a single "Refresh now?" prompt for it; declining allows a later check to prompt again
- Confirming the prompt tells the waiting service worker to activate and waits for it to actually take control before reloading, so the page never reloads into a mix of old in-memory JS and newly-cached assets
- Checks for updates every time the app becomes visible
- Prompts user to refresh when a new version is available

---

## 🗂️ Project Structure

    BudgetApp/
    ├── index.html          # App shell, meta tags, PWA configuration, sticky header
    ├── style.css           # All styling — layout, components, sheets, sticky positioning
    ├── app.js              # All app logic, data management, undo/redo, export/import, rendering
    ├── sw.js               # Service worker — caching and update detection
    ├── version.json        # Single source of truth for app version detection
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

⚠️ Clearing Safari's website data will erase all budget entries, undo/redo history, and the remembered last-viewed month. Use Export regularly for a true backup, and grant Persistent Storage permission via the App Permissions menu to reduce automatic data loss.

If on-device storage is full, the app now shows a clear warning instead of silently discarding the change — your edit is either rejected with an explanation, or saved with a note that it couldn't be added to Undo history.

---

## 🔄 Propagation Rules

| Scenario | Behaviour |
|---|---|
| Select "Set Month as Template" | Copies current month to all unprotected future months across all years |
| Month is protected | Skipped by template propagation — data preserved |
| Month is unprotected | Overwritten by template propagation |
| Any manual edit made | Month is automatically protected immediately |
| Protected months beyond a skipped one | Still receive the template — propagation continues past protected months |
| Past months | Never propagated to regardless of protection status |

---

## 🎨 Category Colours

A curated palette of 16 colours is available for category headers and the pie chart. All 16 clear WCAG AA contrast (4.5:1) against the header's fixed black text, and are ordered so that consecutive entries are far apart in hue (worst case ~106° apart) — since this is the order both the default categories and new custom categories are assigned in, and adjacent pie chart slices are exactly where similar colours are hardest to tell apart:

| # | Colour | Hex |
|---|---|---|
| 1 | Lime | #A3CB38 |
| 2 | Blue | #5DADE2 |
| 3 | Coral Red | #FF7E7E |
| 4 | Teal | #1ABC9C |
| 5 | Brown | #D89676 |
| 6 | Slate | #9BA7B2 |
| 7 | Orange | #FF9F43 |
| 8 | Steel Blue | #74AAE2 |
| 9 | Amber | #F39C12 |
| 10 | Indigo | #99A2D8 |
| 11 | Yellow | #F1C40F |
| 12 | Purple | #C096D1 |
| 13 | Sage | #86AF8B |
| 14 | Pink | #FF76B8 |
| 15 | Emerald | #2ECC71 |
| 16 | Rose | #F081B7 |

New categories automatically cycle through the palette in order, skipping colours already in use. Income's colour is independently selectable and defaults to a fixed light grey (#e5e5ea), kept separate from the expense palette.

Categories saved with one of the 10 pre-fix colours are migrated to their corrected equivalent automatically the next time that month is opened — no manual re-colouring needed.

---

## 🖼️ Menu Icon Style

Export, Import, App Permissions, Undo, Redo, Rename, Protected/Unprotected, and Set Month as Template use minimal, bold, black line-style inline SVG icons — a deliberately different visual language from the app's colourful rounded main icon, keeping the day-to-day interface clean and modern. Change Colour, Move Up, Move Down, and Delete remain as simple glyph/emoji controls where retained.

---

## 🚀 Versioning & Updates

There is no build step for this project — the three files below are updated
by hand, and all three must move together or update detection breaks (either
silently, or by re-showing the refresh prompt forever):

1. `app.js` — the `APP_VERSION` constant near the top of the file. This is
   what the running page actually compares itself against, so it's the one
   that matters most for update detection.
2. `version.json` — the `version` field. This is the file fetched fresh
   (bypassing the HTTP cache) to check for a new release; it should always
   match `APP_VERSION`.
3. `sw.js` — the `CACHE_NAME` constant, which forces old caches to be
   cleared. It doesn't have to match the other two exactly (it only needs to
   change on every release, which is why it keeps its own `v` prefix as a
   cache-key naming convention), but keeping it aligned makes debugging a lot
   easier.

`APP_VERSION` and `version.json`'s `version` field intentionally have **no
`v` prefix** (`5.3`, not `v5.3`) — the app's own menus already display the
word "Version" next to it, and doubling that up as "Version v5.3" reads
redundantly.

Example — bumping to 5.4:

    const APP_VERSION = '5.4';          // app.js

    { "version": "5.4" }                // version.json

    const CACHE_NAME = 'budget-app-v5.4'; // sw.js

Recommended versioning convention:

| Change Type | Example |
|---|---|
| Major new features | 6.0 |
| Minor additions | 5.2 |
| Bug fixes | 5.1.1 |

### 📝 Release checklist (SOP for this project)

Every change to this app — however small — follows the same process:

1. Implement the change, keeping the existing formatting and comment style
   (comments explain *why*, not *what*; no comment where the code is
   already self-explanatory)
2. Add or update tests in `tests/app.test.js` covering the change
3. Sense-check the full diff before bumping anything
4. Bump the version in all three files listed above
5. Update this README where it describes user-facing behaviour, and add a
   row to the Version History table below
6. Commit and push

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
| v4.4.1 | Explicit app-version detection via `version.json`; version removed from `app.js` config and kept only in `sw.js` and `version.json`; update check now runs on load and resume via `version.json`; active month tab alignment centralized and re-run with deferred timing on load, month/year change, and app resume |
| v5 | Row-level vertical ellipsis menu replaces remove-row button; each row can now switch between Fully Paid and Running Total modes; Running Total rows replace the checkbox with a numeric input; In Account now subtracts running totals directly for Running Total rows; Remaining / budget impact for Running Total rows uses the greater of budgeted cost and running total; running total text turns red when it exceeds the allocated budget |
| v5.0.1 | Status header right-aligned; checkbox and running total inputs right-aligned; Balance renamed to Budgeted Balance; Income row menu limited to Remove Row only; export/import confirmation updated to explicitly include row modes, paid state, and running total values |
| v5.1 | Category ellipsis updated to match row ellipsis; Protected/Unprotected moved into main menu as Month Protected/Unprotected; Set Month as Template moved into main menu; Permissions renamed to App Permissions; submenu back buttons added in the top-left corner; app version added as a greyed-out line at the bottom of menus; submenu icons reviewed and aligned with the app’s minimal line-icon theme |
| v5.2 | Main menu labels updated for current-month template/protection actions, submenu back navigation refined, and row reordering added within categories |
| v5.2.1 | Minor patch fixes and version bump to 5.2.1 |
| v5.2.2 | Bug fixes — "In Account" no longer displays overspend as a positive amount; a full storage quota now warns and preserves existing data instead of silently discarding the edit; Undo/Redo no longer errors after restoring a snapshot; History import only writes recognised app data keys; import file picker now resets correctly after a cancelled or invalid import; category colours from imported/legacy data are validated before rendering; cost and running total values are HTML-escaped when rendered; removing the last row in a category now shows feedback instead of doing nothing; update detection no longer errors if the service worker has already advanced past the "installing" state |
| v5.2.3 | Bug fixes — the app now compares against its own baked-in `APP_VERSION` instead of learning a baseline from the first check, so a stale cached bundle is reliably detected even on a cold start; the service worker and version.json checks now share a single reload prompt instead of potentially showing two; the service worker no longer activates and claims open pages before the user has confirmed the refresh, which could previously serve a mix of old in-memory JS and newly-cached assets; the menu now shows the running version instantly with no "Loading..." placeholder, and without the redundant "Version v" wording |
| v5.3 | Editing a row no longer rebuilds the whole page (fixes lost keyboard focus mid-edit); routine feedback (undo/redo, import results, warnings) now shows as a toast instead of a blocking alert; category header text automatically switches between dark and light for readability against any palette colour; bottom sheet is now a proper dialog, dismissible with Escape, with accessible input labels; dark mode via `prefers-color-scheme`; `orientation: portrait` locked and `theme-color`/`mobile-web-app-capable` meta tags added |
| v5.3.1 | Bug fix — the per-row ⋮ menu button kept its light-mode text colour in dark mode, nearly invisible against the dark card background; added a test that scans for this class of miss (any selector with fixed dark text in light mode that isn't also overridden in the dark-mode block) rather than just the one instance |
| v5.3.2 | Bug fix — the expense name and cost inputs on every row had no text colour set at all and relied on the browser's default (black) rather than inheriting from the page, so they stayed black in dark mode regardless of the previous fix; both now explicitly inherit the page's text colour |
| v5.4 | Category header text is now always black instead of switching between dark/light per category — the previous adaptive logic worked, but a single standard colour was preferred for consistency; `pickTextColour()` removed |
| v5.5 | 10 of 16 category colours didn't actually meet WCAG AA contrast against the now-fixed black header text (checked properly this time, not just the rough heuristic from v5.4) — those 10 were lightened to clear it, and all 16 were reordered so consecutive entries are far apart in hue, since that's the order adjacent pie chart slices get. Categories saved with an old colour are migrated automatically on load. The category ⋮ menu button now explicitly matches the header text's colour and weight — it turns out buttons don't inherit `color`/`font-weight` from the page by default any more reliably than inputs do |

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
- Fetch API (`version.json` update detection)