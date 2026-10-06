# 💸 Budget with Elias

A colourful, easy budgeting app for tracking **spending, income, budgets and debts** in **Bahraini Dinar (BHD)**.

## Features
- **Dashboard**: this month's balance, income, spending and budget left, a "where your money went" donut, daily spending chart, alerts (over budget, overdue debts), recent transactions and a debts snapshot.
- **Transactions**: record expenses and income with amount (3-decimal BHD), category, date, place/shop, payment method (Cash, Debit/Credit Card, BenefitPay, Bank Transfer, Apple Pay) and a note. Filter by type, category, method, or search text. Edit or delete any record.
- **Budgets**: an overall monthly limit plus a limit per category, with green, amber and red progress bars and a "safe to spend per day" figure.
- **Debts**: "I owe" and "Owed to me" tabs, partial payments with history, due dates and overdue badges. A payment can also be logged as a transaction automatically.
- **Insights**: spending by category, top places, payment methods, day of the week, 6-month income vs spending, daily average, biggest expense and change vs last month.
- **Pay-cycle months**: each budget month starts on your salary day (default the 25th). If the salary arrives a few days early or late (e.g. the 24th), the month starts on that day automatically. Any single month can be adjusted with the ✏️ button next to the month.
- **Savings**: savings accounts with optional goals, deposits and withdrawals with history, and a button to hide amounts. Money moved to savings lowers the month's balance without counting as spending. The whole section can be hidden in Settings → Sections.
- **Plan ahead**: a future-purchases wishlist (price, priority, buy-by date, money set aside, mark as bought) and a budget plan for next month (expected income, savings, planned spending per category, upcoming purchases, and what's left over). A plan can be applied as your budgets in one tap.
- **Categories**: add your own straight from the add-expense form (＋ New category), from Budgets, or from Settings.
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

## Your data & cloud sync
Without signing in, data is stored only in the browser on that device.

Sign in with Google under **Settings → Cloud sync** to keep the same data on every phone and computer. Changes appear on your other devices within a second or two, and edits made offline sync when you're back online. The first time a device signs in, anything already on it is added to your account.

### One-time Firebase setup (project `budget-with-elias`)
1. **Authentication** → Get started → Sign-in method → enable **Google**.
2. **Firestore Database** → Create database (choose a location, start in production mode).
3. **Firestore → Rules**: replace the rules with the contents of [`firestore.rules`](firestore.rules), then click **Publish**. This makes sure only you can read your data.
4. **Authentication → Settings → Authorized domains**: add `eliasalsaei.github.io` (where the app is hosted).

Data is stored as `users/{your id}/data/main` (categories, budgets, debts, settings) and `users/{your id}/months/{YYYY-MM}` (transactions for each month).

See [PLAN.md](PLAN.md) for the design plan.
