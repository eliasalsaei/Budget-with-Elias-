// Pure helpers for cloud sync (no Firebase imports, so they can be tested on their own).
//
// Cloud layout per user:
//   users/{uid}/data/main        -> { json: "<categories, budgets, debts, settings, savings, wishlist, plans>" }
//   users/{uid}/months/{YYYY-MM} -> { json: "<transactions of that month>" }
// Splitting transactions by month keeps every document far below Firestore's 1 MB limit
// and means one edit only rewrites one small document.

export const MAIN = 'main';

// Turn app state into { main: string, months: { 'YYYY-MM': string } }
export function split(state) {
  const { categories, budgets, debts, settings, savings, wishlist, plans } = state;
  const main = JSON.stringify({ version: 1, categories, budgets, debts, settings, savings, wishlist, plans });
  const groups = {};
  for (const t of state.transactions || []) {
    const key = /^\d{4}-\d{2}/.test(t.date || '') ? t.date.slice(0, 7) : 'undated';
    (groups[key] ||= []).push(t);
  }
  const months = {};
  for (const key of Object.keys(groups).sort()) {
    months[key] = JSON.stringify(groups[key].sort((a, b) => String(a.id).localeCompare(String(b.id))));
  }
  return { main, months };
}

// Inverse of split. main may be null when the cloud has no data yet.
export function join(main, months) {
  const base = main ? JSON.parse(main) : {};
  const transactions = Object.keys(months).sort().flatMap((k) => JSON.parse(months[k]));
  return { ...base, transactions };
}

export function isCloudEmpty(main, months) {
  return !main && Object.keys(months).length === 0;
}

// Work out which documents to write or delete to go from `prev` to `next` (both split() results).
export function diff(prev, next) {
  const writes = {};
  const deletes = [];
  if (next.main !== prev.main) writes[MAIN] = next.main;
  for (const [k, v] of Object.entries(next.months)) if (prev.months[k] !== v) writes[k] = v;
  for (const k of Object.keys(prev.months)) if (!(k in next.months)) deletes.push(k);
  return { writes, deletes, empty: Object.keys(writes).length === 0 && deletes.length === 0 };
}

// First time a device links to an account: keep everything from both sides.
// When the same item exists on both sides, the cloud copy wins.
export function merge(cloud, local) {
  const byId = (a = [], b = []) => {
    const seen = new Set(a.map((x) => x.id));
    return [...a, ...b.filter((x) => !seen.has(x.id))];
  };
  return {
    version: 1,
    categories: byId(cloud.categories, local.categories),
    transactions: byId(cloud.transactions, local.transactions),
    debts: byId(cloud.debts, local.debts),
    savings: byId(cloud.savings, local.savings),
    wishlist: byId(cloud.wishlist, local.wishlist),
    plans: { ...(local.plans || {}), ...(cloud.plans || {}) },
    budgets: {
      overall: Number(cloud.budgets?.overall) || Number(local.budgets?.overall) || 0,
      byCategory: { ...(local.budgets?.byCategory || {}), ...(cloud.budgets?.byCategory || {}) },
    },
    settings: { ...(local.settings || {}), ...(cloud.settings || {}) },
  };
}
