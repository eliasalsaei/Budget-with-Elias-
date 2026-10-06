# 💸 Budget with Elias

A colourful, easy budgeting app for tracking **spending, income, budgets and debts** in **Bahraini Dinar (BHD)**.

## Features
- **Dashboard**: this month's balance, income, spending and budget left, a "where your money went" donut, daily spending chart, alerts (over budget, overdue debts), recent transactions and a debts snapshot.
- **Transactions**: record expenses and income with amount (3-decimal BHD), category, date, place/shop, payment method (Cash, Debit/Credit Card, BenefitPay, Bank Transfer, Apple Pay) and a note. Filter by type, category, method, or search text. Edit or delete any record.
- **Budgets**: an overall monthly limit plus a limit per category, with green, amber and red progress bars and a "safe to spend per day" figure.
- **Debts**: "I owe" and "Owed to me" tabs, partial payments with history, due dates and overdue badges. A payment can also be logged as a transaction automatically.
- **Insights**: spending by category, top places, payment methods, day of the week, 6-month income vs spending, daily average, biggest expense and change vs last month.
- **Settings**: add, edit or delete categories (emoji + colour), light/dark/auto theme, JSON backup and restore, CSV export (opens in Excel), demo data, and erase all data.
- Works on phone and desktop, can be installed to the home screen, and works offline.

## How to use
**Run on your computer:** open `index.html` in a browser. For the offline/install features, serve the folder instead:
```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

**Put it on your phone:** enable **GitHub Pages** for this repository (Settings → Pages → deploy from branch). Open the link on your phone, then use **Share → Add to Home Screen** (iPhone) or **Install app** (Android).

Tip: go to **Settings → Load demo data** to see the app filled with example data, then **Erase all data** to start fresh.

## Your data
Everything is stored only in your browser on your device (no account, no server). Use **Settings → Backup (JSON)** regularly. Clearing browser data or switching devices requires restoring from a backup.

See [PLAN.md](PLAN.md) for the design plan.
