# Budget with Elias — Plan

A colourful, easy budgeting app for recording spending, income and debts in **Bahraini Dinar (BHD)**.

## 1. Goals
- Record every expense and income quickly (amount, category, date, place, payment method, note).
- Organise spending into **categories**, each with its own colour and emoji.
- Set **monthly budgets** (overall and per category) and see how much is left.
- Track **debts**: money I owe and money owed to me, with partial payments and due dates.
- Show **where the money goes**: by category, by place/merchant, by payment method, by day, and over months.
- Bright, colourful design that works on phone and desktop.

## 2. Technology
- Plain HTML + CSS + JavaScript. No build step, no server, no account.
- Data saved in the browser (`localStorage`), so it stays private on the device.
- Installable on the home screen (PWA manifest + service worker) and works offline.
- Backup and restore through JSON export/import, plus CSV export for Excel.

## 3. Currency
- All amounts in BHD with **3 decimals** (1 BHD = 1000 fils), e.g. `BHD 12.500`.

## 4. Screens
| Screen | What it shows |
|---|---|
| **Dashboard** | Month balance, income, spending, budget left, spending-by-category donut, daily spending chart, budget alerts, debt snapshot, recent transactions |
| **Transactions** | Full list grouped by day, with filters (type, category, payment method, search), plus edit and delete |
| **Budgets** | Overall monthly budget and a limit for each category, with green, amber and red progress bars |
| **Debts** | "I owe" and "Owed to me" tabs, remaining amount, progress, due date, overdue badge, payment history. A payment can also be logged as a transaction |
| **Insights** | Where spending goes: categories ranked, top places, payment methods, 6-month income-vs-spending trend, daily average, biggest expense, change vs last month |
| **Settings** | Manage categories (add, edit, delete), export/import backup, export CSV, load demo data, erase everything |

A month switcher (◀ Oct 2026 ▶) at the top controls which month every screen shows.

## 5. Data model
```
transaction: { id, type: expense|income, amount, categoryId, date, place, method, note }
category:    { id, name, icon, color, type: expense|income }
budgets:     { overall, byCategory: { categoryId: limit } }
debt:        { id, direction: owe|owed, person, amount, dueDate, note, createdAt, payments: [{ id, amount, date }] }
```

## 6. Build steps
1. Page shell, navigation (sidebar on desktop, bottom bar on phone), colour theme with light and dark modes.
2. Data layer: load/save, default categories, BHD formatting.
3. Add/edit transaction form, and the transactions list with filters.
4. Dashboard cards and SVG charts.
5. Budgets screen.
6. Debts screen with payments.
7. Insights screen.
8. Settings: categories, backup/restore, CSV, demo data.
9. PWA manifest, offline service worker, README.
