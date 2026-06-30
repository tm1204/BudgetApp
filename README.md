# BudgetApp

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

The app will appear on your home screen and run in full-screen mode like a native app.

---

## ✨ Features

- **Year selector** — covers current year + 4 years ahead
- **Monthly tabs** — one tab per month, January through December
- **8 budget categories** — Income, Tithes, Home, Vehicles, Debits, Food, Fuel, Entertainment
- **Dynamic rows** — add or remove expense rows per category
- **Running remaining** — auto-calculated balance after each expense
- **Section totals** — each category heading shows its total
- **Paid tickboxes** — mark individual expenses as paid
- **In Account** — live total showing Income minus only paid expenses
- **Smart propagation** — expenses carry forward month to month with costs intact and paid boxes reset; past months are never overwritten
- **Offline support** — full PWA with service worker caching
- **Auto-update prompt** — app notifies you when a new version is available

---

## 🗂️ Project Structure

budget-app/
├── index.html          # App shell and meta tags
├── style.css           # All styling
├── app.js              # App logic, data, rendering
├── sw.js               # Service worker (caching + update detection)
├── manifest.json       # PWA manifest (icons, display, theme)
├── README.md           # This file
└── icons/
    ├── icon-192.png    # App icon (home screen)
    └── icon-512.png    # App icon (splash screen)

---

## 💾 Data Storage

All budget data is stored in the browser's localStorage — no server, no account, no internet required after first load. Data persists across sessions and app restarts.

⚠️ Clearing Safari's website data will erase your budget entries.

---

## 🔄 Propagation Rules

| Scenario                                  | Behaviour                                                              |
|-------------------------------------------|------------------------------------------------------------------------|
| Opening a future month with no data       | Inherits expenses + costs from nearest previous month, paid boxes reset |
| Editing current or future month           | Saves to that month and propagates forward to uninherited months       |
| Editing a past month                      | Saves to that month only — no propagation                              |
| Future month already manually edited      | Never overwritten                                                      |

---

## 🚀 Versioning & Updates

When deploying a new version, update the cache name in sw.js:

    const CACHE_NAME = 'budget-app-v3.1';

Change this string with every release (e.g. v3.1 → v3.2 → v4). This triggers the service worker to clear old caches and prompt users to refresh.

---

## 🛠️ Built With

- HTML5
- CSS3 (CSS Grid)
- Vanilla JavaScript (ES6+)
- Web Storage API (localStorage)
- Service Worker API
- Web App Manifest (PWA)