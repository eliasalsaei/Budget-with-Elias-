/* Budget with Elias — all app logic. Data lives in localStorage on this device. */
(() => {
  'use strict';

  const STORAGE_KEY = 'budgetWithElias.v1';
  const METHODS = ['Cash', 'Debit Card', 'Credit Card', 'BenefitPay', 'Bank Transfer', 'Apple Pay', 'Other'];
  // Soft, muted colours for categories and accounts
  const PALETTE = ['#d9665b', '#e8875a', '#e3b04b', '#8ab17d', '#4caf8e', '#2a9d8f', '#4fb0c6', '#5aa3e0',
    '#5b8def', '#7b8cde', '#9d86d8', '#b38ad6', '#c77dba', '#e07a9a', '#7d8597', '#a08f80'];
  // Earlier bright colours mapped to their soft versions (applied once to saved data)
  const OLD_COLORS = Object.fromEntries([
    ...['#f43f5e', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#64748b', '#78716c'].map((c, i) => [c, PALETTE[i]]),
    ['#ef4444', '#d9665b'], ['#94a3b8', '#a0a7b4'],
  ]);

  const DEFAULT_CATEGORIES = [
    ['food', 'Food & Dining', '🍔', '#e8875a', 'expense'],
    ['groceries', 'Groceries', '🛒', '#8ab17d', 'expense'],
    ['transport', 'Transport & Fuel', '⛽', '#5aa3e0', 'expense'],
    ['shopping', 'Shopping', '🛍️', '#e07a9a', 'expense'],
    ['bills', 'Bills & Utilities', '💡', '#e3b04b', 'expense'],
    ['housing', 'Rent & Housing', '🏠', '#9d86d8', 'expense'],
    ['health', 'Health', '💊', '#4caf8e', 'expense'],
    ['fun', 'Entertainment', '🎬', '#c77dba', 'expense'],
    ['education', 'Education', '📚', '#7b8cde', 'expense'],
    ['travel', 'Travel', '✈️', '#4fb0c6', 'expense'],
    ['family', 'Family & Gifts', '🎁', '#d9665b', 'expense'],
    ['subs', 'Subscriptions', '📱', '#5b8def', 'expense'],
    ['debtpay', 'Debt Payment', '💳', '#d9665b', 'expense'],
    ['other', 'Other', '📦', '#7d8597', 'expense'],
    ['salary', 'Salary', '💼', '#4caf8e', 'income'],
    ['freelance', 'Freelance', '💻', '#2a9d8f', 'income'],
    ['giftin', 'Gifts Received', '🎉', '#b38ad6', 'income'],
    ['debtin', 'Debt Repaid to Me', '🤝', '#4fb0c6', 'income'],
    ['otherin', 'Other Income', '💰', '#8ab17d', 'income'],
  ].map(([id, name, icon, color, type]) => ({ id, name, icon, color, type }));
  // Money moved to or from savings: shown in transactions, but not counted as spending or income.
  const TRANSFER_CATEGORIES = [
    { id: 'tosavings', name: 'To Savings', icon: '🐷', color: '#b38ad6', type: 'expense', transfer: true },
    { id: 'fromsavings', name: 'From Savings', icon: '🐷', color: '#b38ad6', type: 'income', transfer: true },
  ];

  const VIEW_TITLES = {
    dashboard: 'Dashboard', transactions: 'Transactions', budgets: 'Budgets',
    debts: 'Debts', insights: 'Insights', settings: 'Settings',
    savings: 'Savings', plan: 'Plan ahead',
  };
  const PRIORITIES = {
    high: ['', 'Must have'],
    medium: ['', 'Nice to have'],
    low: ['', 'Someday'],
  };
  const MASK_KEY = 'budgetWithElias.maskSavings';

  // ---------- Helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const round3 = (n) => Math.round((Number(n) || 0) * 1000) / 1000;
  const sum = (arr, fn = (x) => x) => round3(arr.reduce((a, x) => a + (Number(fn(x)) || 0), 0));

  const bhdFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  const bhd = (n) => `BHD ${bhdFmt.format(round3(n))}`;
  const bhdShort = (n) => {
    const v = Math.abs(n);
    if (v >= 1000) return `${(n / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
    return v >= 100 ? Math.round(n).toString() : (Math.round(n * 10) / 10).toString();
  };

  const pad = (n) => String(n).padStart(2, '0');
  const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const parseMonth = (key) => { const [y, m] = key.split('-').map(Number); return new Date(y, m - 1, 1); };
  const shiftMonth = (key, delta) => { const d = parseMonth(key); d.setMonth(d.getMonth() + delta); return monthKey(d); };
  const monthName = (key, opts = { month: 'long', year: 'numeric' }) => parseMonth(key).toLocaleDateString('en-GB', opts);
  const daysInMonth = (key) => { const d = parseMonth(key); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); };
  const fmtDate = (s, opts = { day: 'numeric', month: 'short', year: 'numeric' }) => {
    if (!s) return '';
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-GB', opts);
  };
  const dayHeading = (s) => {
    const t = todayStr();
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (s === t) return 'Today';
    if (s === `${y.getFullYear()}-${pad(y.getMonth() + 1)}-${pad(y.getDate())}`) return 'Yesterday';
    return fmtDate(s, { weekday: 'long', day: 'numeric', month: 'short' });
  };

  // ---------- State ----------
  function freshState() {
    return {
      version: 1,
      categories: [...DEFAULT_CATEGORIES, ...TRANSFER_CATEGORIES].map((c) => ({ ...c })),
      transactions: [],
      budgets: { overall: 0, byCategory: {} },
      debts: [],
      savings: [],   // { id, name, icon, color, goal, entries: [{ id, amount (+in / -out), date, note, txId? }] }
      wishlist: [],  // { id, name, price, priority, targetDate, categoryId, link, note, saved, status, boughtDate, boughtPrice }
      plans: {},     // { 'YYYY-MM': { income, savings, byCategory: { categoryId: amount } } }
      // cycleDay: the day each budget month starts (salary day). salaryStart: start on the actual
      // salary date when it lands within a few days of cycleDay. cycleOverrides: { 'YYYY-MM': 'YYYY-MM-DD' }.
      settings: { theme: 'auto', cycleDay: 25, salaryStart: true, cycleOverrides: {}, showSavings: true, showPlan: true, paletteVersion: 2 },
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return freshState();
      return normalize(JSON.parse(raw));
    } catch (e) {
      console.warn('Could not load saved data', e);
      return freshState();
    }
  }

  function normalize(s) {
    const base = freshState();
    if (!s || typeof s !== 'object') return base;
    const categories = Array.isArray(s.categories) && s.categories.length ? [...s.categories] : base.categories;
    for (const tc of TRANSFER_CATEGORIES) if (!categories.some((c) => c.id === tc.id)) categories.push({ ...tc });
    const soften = (x) => (OLD_COLORS[String(x.color).toLowerCase()] ? { ...x, color: OLD_COLORS[String(x.color).toLowerCase()] } : x);
    const migrate = (s.settings?.paletteVersion || 1) < 2;
    if (migrate) categories.splice(0, categories.length, ...categories.map(soften));
    return {
      version: 1,
      categories,
      transactions: Array.isArray(s.transactions) ? s.transactions : [],
      budgets: { overall: Number(s.budgets?.overall) || 0, byCategory: { ...(s.budgets?.byCategory || {}) } },
      debts: Array.isArray(s.debts) ? s.debts.map((d) => ({ payments: [], ...d })) : [],
      savings: Array.isArray(s.savings) ? s.savings.map((a) => (migrate ? soften({ entries: [], ...a }) : { entries: [], ...a })) : [],
      wishlist: Array.isArray(s.wishlist) ? s.wishlist : [],
      plans: s.plans && typeof s.plans === 'object' ? s.plans : {},
      settings: { ...base.settings, ...(s.settings || {}), paletteVersion: 2 },
    };
  }

  let state = loadState();
  let saveFailed = false;
  function save({ sync = true } = {}) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      saveFailed = false;
    } catch (e) {
      if (!saveFailed) toast('Could not save — browser storage is unavailable');
      saveFailed = true;
    }
    if (sync) window.BudgetSync?.push();
  }

  // ---------- Budget months (pay cycle) ----------
  // A budget month is named by the calendar month it starts in ('YYYY-MM'). With cycleDay 25,
  // '2026-09' runs from 25 Sep to 24 Oct, unless the salary arrived a little earlier or later.
  const SALARY_WINDOW = 4; // days either side of cycleDay to look for the salary
  const OVERRIDE_WINDOW = 10; // how far a manual start may move from cycleDay
  const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseDate = (str) => { const [y, m, d] = str.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (str, n) => { const d = parseDate(str); d.setDate(d.getDate() + n); return dateStr(d); };
  const dayDiff = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);
  const cycleDay = () => Math.min(31, Math.max(1, Math.round(Number(state.settings.cycleDay)) || 1));
  const nominalStart = (key) => `${key}-${pad(Math.min(cycleDay(), daysInMonth(key)))}`;

  function salaryDateNear(key) {
    const nominal = nominalStart(key);
    const lo = addDays(nominal, -SALARY_WINDOW), hi = addDays(nominal, SALARY_WINDOW);
    const salaryIds = new Set(state.categories.filter((c) => c.type === 'income' && (c.id === 'salary' || /salary|راتب/i.test(c.name))).map((c) => c.id));
    return state.transactions
      .filter((t) => t.type === 'income' && salaryIds.has(t.categoryId) && t.date >= lo && t.date <= hi)
      .map((t) => t.date).sort()[0] || null;
  }
  function periodStart(key) {
    const manual = state.settings.cycleOverrides?.[key];
    if (manual) return manual;
    if (cycleDay() > 1 && state.settings.salaryStart !== false) {
      const paid = salaryDateNear(key);
      if (paid) return paid;
    }
    return nominalStart(key);
  }
  const periodEnd = (key) => addDays(periodStart(shiftMonth(key, 1)), -1);
  const periodDays = (key) => Math.max(1, dayDiff(periodStart(key), periodEnd(key)) + 1);
  function periodKeyOf(date) {
    const key = date.slice(0, 7);
    if (date < periodStart(key)) return shiftMonth(key, -1);
    if (date >= periodStart(shiftMonth(key, 1))) return shiftMonth(key, 1);
    return key;
  }
  const currentPeriod = () => periodKeyOf(todayStr());
  const daysElapsed = (key) => (key === currentPeriod() ? dayDiff(periodStart(key), todayStr()) + 1 : periodDays(key));
  const isCalendarMonth = (key) => periodStart(key) === `${key}-01` && periodEnd(key) === `${key}-${pad(daysInMonth(key))}`;
  function periodLabel(key, short = false) {
    if (isCalendarMonth(key)) return monthName(key, short ? { month: 'short' } : undefined);
    const start = periodStart(key), end = periodEnd(key);
    if (short) return fmtDate(start, { day: 'numeric', month: 'short' });
    const sameYear = start.slice(0, 4) === end.slice(0, 4);
    return `${fmtDate(start, sameYear ? { day: 'numeric', month: 'short' } : undefined)} – ${fmtDate(end)}`;
  }

  const ui = {
    view: 'dashboard',
    month: currentPeriod(),
    txFilter: { type: 'all', category: '', method: '', q: '' },
    planOffset: 1, // which budget month the plan screen shows, relative to the current one
    maskSavings: (() => { try { return localStorage.getItem(MASK_KEY) === '1'; } catch { return false; } })(),
    debtTab: 'owe',
  };

  const catById = (id) => state.categories.find((c) => c.id === id) || { id, name: 'Uncategorised', icon: '❔', color: '#a0a7b4', type: 'expense' };
  const catsOf = (type) => state.categories.filter((c) => c.type === type && !c.transfer);
  const isTransfer = (t) => !!catById(t.categoryId).transfer;
  const txInMonth = (key = ui.month) => {
    const start = periodStart(key), end = periodEnd(key);
    return state.transactions.filter((t) => t.date && t.date >= start && t.date <= end);
  };
  const expensesIn = (key) => txInMonth(key).filter((t) => t.type === 'expense' && !isTransfer(t));
  const incomeIn = (key) => txInMonth(key).filter((t) => t.type === 'income' && !isTransfer(t));
  // Net money moved into savings from this month's budget (deposits minus withdrawals)
  const savedIn = (key) => round3(sum(txInMonth(key).filter((t) => isTransfer(t)), (t) => (t.type === 'expense' ? t.amount : -t.amount)));
  const accountBalance = (a) => sum(a.entries || [], (e) => e.amount);
  const showSavings = () => state.settings.showSavings !== false;
  const showPlan = () => state.settings.showPlan !== false;
  const debtPaid = (d) => sum(d.payments || [], (p) => p.amount);
  const debtLeft = (d) => Math.max(0, round3(d.amount - debtPaid(d)));
  const sortTx = (list) => [...list].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));

  function spendByCategory(key) {
    const map = new Map();
    for (const t of expensesIn(key)) map.set(t.categoryId, round3((map.get(t.categoryId) || 0) + t.amount));
    return [...map.entries()].map(([id, total]) => ({ cat: catById(id), total })).sort((a, b) => b.total - a.total);
  }

  // ---------- Theme ----------
  function applyTheme() {
    const t = state.settings.theme;
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }

  // ---------- Toast ----------
  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  // ---------- Modal ----------
  const modal = $('#modal');
  function openModal(html, onMount) {
    $('#modalBody').innerHTML = html;
    if (!modal.open) modal.showModal();
    onMount && onMount($('#modalBody'));
  }
  function closeModal() { if (modal.open) modal.close(); }
  modal.addEventListener('click', (e) => {
    if (e.target === modal || e.target.closest('[data-close]')) closeModal();
  });

  function confirmBox(message, onYes, yesLabel = 'Delete') {
    openModal(`
      <div class="modal-head"><h2>Are you sure?</h2></div>
      <p style="margin:0;color:var(--muted)">${esc(message)}</p>
      <div class="modal-foot">
        <button class="btn" data-close>Cancel</button>
        <button class="btn btn-danger" id="confirmYes">${esc(yesLabel)}</button>
      </div>`, (root) => {
      $('#confirmYes', root).onclick = () => { closeModal(); onYes(); };
    });
  }

  // ---------- Small render helpers ----------
  const ICONS = {
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    left: '<path d="M15 6l-6 6 6 6"/>',
    right: '<path d="M9 6l6 6-6 6"/>',
  };
  const svg = (name) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
  const icon = (cat, size = 44) =>
    `<span class="tx-ico" style="width:${size}px;height:${size}px;background:color-mix(in srgb, ${cat.color} 18%, transparent);color:${cat.color}">${esc(cat.icon)}</span>`;

  function txRow(t, { actions = true } = {}) {
    const cat = catById(t.categoryId);
    const title = t.place || cat.name;
    const meta = [t.place ? cat.name : null, t.method, t.note].filter(Boolean).map(esc).join(' · ');
    return `
      <div class="tx">
        ${icon(cat)}
        <div class="tx-main">
          <div class="tx-title">${esc(title)}</div>
          <div class="tx-meta">${meta || fmtDate(t.date)}</div>
        </div>
        <div class="tx-right">
          <div class="tx-amt ${cat.transfer ? 'transfer' : t.type}">${t.type === 'expense' ? '−' : '+'}${bhd(t.amount)}</div>
          ${actions ? `<div class="tx-actions">
            <button data-action="edit-tx" data-id="${t.id}" title="Edit">${svg('edit')}</button>
            <button data-action="del-tx" data-id="${t.id}" title="Delete">${svg('trash')}</button>
          </div>` : ''}
        </div>
      </div>`;
  }

  const empty = (_icon, text, btn = '') => `<div class="empty">${text}${btn ? `<div style="margin-top:12px">${btn}</div>` : ''}</div>`;

  function donut(rows, total, centerLabel) {
    if (!rows.length || total <= 0) return empty('🍩', 'No spending recorded this month yet.');
    let offset = 0;
    const segs = rows.map((r) => {
      const pct = (r.total / total) * 100;
      const seg = `<circle r="15.9155" cx="21" cy="21" fill="none" stroke="${r.cat.color}" stroke-width="6"
        stroke-dasharray="${Math.max(pct - 0.4, 0.1)} ${100 - Math.max(pct - 0.4, 0.1)}" stroke-dashoffset="${-offset}"><title>${esc(r.cat.name)}: ${bhd(r.total)}</title></circle>`;
      offset += pct;
      return seg;
    }).join('');
    const top = rows.slice(0, 7);
    const rest = rows.slice(7);
    const legendRows = top.map((r) => ({ name: `${r.cat.icon} ${r.cat.name}`, color: r.cat.color, total: r.total }));
    if (rest.length) legendRows.push({ name: `${rest.length} more`, color: '#a0a7b4', total: sum(rest, (r) => r.total) });
    return `
      <div class="donut-wrap">
        <div class="donut">
          <svg viewBox="0 0 42 42"><circle r="15.9155" cx="21" cy="21" fill="none" stroke="var(--bg-2)" stroke-width="6"></circle>${segs}</svg>
          <div class="donut-center"><small>${esc(centerLabel)}</small><b>${bhd(total)}</b></div>
        </div>
        <div class="legend">
          ${legendRows.map((r) => `<div class="legend-item" style="--c:${r.color}"><i></i><span>${esc(r.name)}</span><b>${Math.round((r.total / total) * 100)}%</b></div>`).join('')}
        </div>
      </div>`;
  }

  // Vertical bar chart. series: [{ label, values: [..], color }], labels: x labels
  function barChart(labels, series, { height = 180, labelEvery = 1 } = {}) {
    const W = 600, H = height, padL = 34, padB = 22, padT = 8;
    const max = Math.max(1, ...series.flatMap((s) => s.values));
    const niceMax = niceCeil(max);
    const plotW = W - padL, plotH = H - padB - padT;
    const groupW = plotW / labels.length;
    const barW = Math.max(2, Math.min(28, (groupW * 0.72) / series.length));
    let out = '';
    for (let i = 0; i <= 4; i++) {
      const v = (niceMax / 4) * i;
      const y = padT + plotH - (v / niceMax) * plotH;
      out += `<line class="grid-line" x1="${padL}" x2="${W}" y1="${y}" y2="${y}"></line><text x="${padL - 6}" y="${y + 3}" text-anchor="end">${bhdShort(v)}</text>`;
    }
    labels.forEach((lab, i) => {
      const gx = padL + i * groupW + (groupW - barW * series.length) / 2;
      series.forEach((s, si) => {
        const v = s.values[i] || 0;
        const h = (v / niceMax) * plotH;
        const x = gx + si * barW;
        if (v > 0) out += `<rect class="bar-x" x="${x}" y="${padT + plotH - h}" width="${barW - 1}" height="${h}" rx="${Math.min(4, barW / 3)}" fill="${s.color}"><title>${esc(lab)} — ${esc(s.label)}: ${bhd(v)}</title></rect>`;
      });
      if (i % labelEvery === 0) out += `<text x="${padL + i * groupW + groupW / 2}" y="${H - 6}" text-anchor="middle">${esc(lab)}</text>`;
    });
    return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${out}</svg></div>`;
  }
  function niceCeil(v) {
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
    return 10 * p;
  }

  function rankList(rows, total, emptyText) {
    if (!rows.length) return empty('🔍', emptyText);
    return rows.map((r) => `
      <div class="rank-row">
        <div class="rank-name"><span>${esc(r.icon || '')}</span><span>${esc(r.name)}</span></div>
        <div class="rank-val">${bhd(r.total)}<small>${total ? Math.round((r.total / total) * 100) : 0}%</small></div>
        <div class="bar" style="--c:${r.color}"><i style="width:${total ? (r.total / total) * 100 : 0}%"></i></div>
      </div>`).join('');
  }

  function budgetColor(pct) { return pct > 100 ? 'var(--expense)' : pct >= 80 ? 'var(--warn)' : 'var(--income)'; }

  // ---------- Views ----------
  function renderDashboard() {
    const exp = expensesIn(ui.month), inc = incomeIn(ui.month);
    const spent = sum(exp, (t) => t.amount), earned = sum(inc, (t) => t.amount);
    const saved = savedIn(ui.month);
    const balance = round3(earned - spent - saved);
    const overall = state.budgets.overall;
    const byCat = spendByCategory(ui.month);
    const days = periodDays(ui.month);
    const start = periodStart(ui.month);
    const daily = Array(days).fill(0);
    exp.forEach((t) => { const i = dayDiff(start, t.date); if (i >= 0 && i < days) daily[i] += t.amount; });
    const dayLabels = daily.map((_, i) => String(Number(addDays(start, i).slice(8, 10))));

    const iOwe = sum(state.debts.filter((d) => d.direction === 'owe'), debtLeft);
    const owedMe = sum(state.debts.filter((d) => d.direction === 'owed'), debtLeft);

    const alerts = [];
    if (overall > 0 && spent >= overall * 0.8) {
      alerts.push(spent > overall
        ? `<div class="alert red">You are over your monthly budget by ${bhd(spent - overall)}.</div>`
        : `<div class="alert amber">You have used ${Math.round((spent / overall) * 100)}% of your monthly budget.</div>`);
    }
    for (const r of byCat) {
      const lim = Number(state.budgets.byCategory[r.cat.id]) || 0;
      if (!lim) continue;
      if (r.total > lim) alerts.push(`<div class="alert red">${esc(r.cat.icon)} ${esc(r.cat.name)} is over budget by ${bhd(r.total - lim)} (${bhd(r.total)} of ${bhd(lim)}).</div>`);
      else if (r.total === lim) alerts.push(`<div class="alert amber">${esc(r.cat.icon)} ${esc(r.cat.name)} has used its full budget of ${bhd(lim)}.</div>`);
      else if (r.total >= lim * 0.8) alerts.push(`<div class="alert amber">${esc(r.cat.icon)} ${esc(r.cat.name)} is at ${Math.round((r.total / lim) * 100)}% of its budget.</div>`);
    }
    const overdue = state.debts.filter((d) => debtLeft(d) > 0 && d.dueDate && d.dueDate < todayStr());
    overdue.forEach((d) => alerts.push(`<div class="alert red">${d.direction === 'owe' ? 'You owe' : 'Owed by'} ${esc(d.person)}: ${bhd(debtLeft(d))} was due ${fmtDate(d.dueDate)}.</div>`));

    const recent = sortTx(txInMonth()).slice(0, 6);
    const budgetLeft = overall > 0 ? round3(overall - spent) : null;

    return `
      <div class="grid grid-4">
        <div class="stat hero"><div class="stat-label">Balance this month</div><div class="stat-value">${bhd(balance)}</div><div class="stat-foot">${balance < 0 ? 'You spent more than you earned' : saved ? `After moving ${bhd(saved)} to savings` : 'Income minus spending'}</div></div>
        <div class="stat income"><div class="stat-label">Income</div><div class="stat-value">${bhd(earned)}</div><div class="stat-foot">${inc.length} record${inc.length === 1 ? '' : 's'}</div></div>
        <div class="stat expense"><div class="stat-label">Spending</div><div class="stat-value">${bhd(spent)}</div><div class="stat-foot">${exp.length} expense${exp.length === 1 ? '' : 's'}</div></div>
        <div class="stat budget"><div class="stat-label">Budget left</div><div class="stat-value">${budgetLeft === null ? '—' : bhd(budgetLeft)}</div><div class="stat-foot">${overall > 0 ? `of ${bhd(overall)}` : '<u data-action="goto" data-view="budgets" style="cursor:pointer">Set a monthly budget</u>'}</div></div>
      </div>

      ${alerts.length ? `<div class="card"><div class="card-head"><h3 class="card-title">Heads up</h3></div><div class="grid" style="gap:8px">${alerts.join('')}</div></div>` : ''}

      <div class="grid grid-2">
        <div class="card">
          <div class="card-head"><h3 class="card-title">Where your money went</h3><button class="link-btn" data-action="goto" data-view="insights">Details →</button></div>
          ${donut(byCat, spent, 'Spent')}
        </div>
        <div class="card">
          <div class="card-head"><h3 class="card-title">Daily spending</h3><span class="card-sub">${periodLabel(ui.month)}</span></div>
          ${spent > 0 ? barChart(dayLabels, [{ label: 'Spent', values: daily, color: '#2a9d8f' }], { labelEvery: days > 20 ? 5 : 1 }) : empty('📅', 'Daily bars will appear once you add expenses.')}
        </div>
      </div>

      <div class="grid grid-2">
        <div class="card">
          <div class="card-head"><h3 class="card-title">Recent transactions</h3><button class="link-btn" data-action="goto" data-view="transactions">See all →</button></div>
          ${recent.length ? `<div class="tx-list">${recent.map((t) => txRow(t)).join('')}</div>`
            : empty('🧾', 'Nothing recorded for this month.', '<button class="btn btn-primary" data-action="add-expense">Add your first expense</button>')}
        </div>
        <div class="card">
          <div class="card-head"><h3 class="card-title">Debts snapshot</h3><button class="link-btn" data-action="goto" data-view="debts">Manage →</button></div>
          <div class="grid grid-2" style="gap:10px">
            <div class="stat debt" style="padding:14px"><div class="stat-label">I owe</div><div class="stat-value" style="font-size:19px">${bhd(iOwe)}</div></div>
            <div class="stat income" style="padding:14px"><div class="stat-label">Owed to me</div><div class="stat-value" style="font-size:19px">${bhd(owedMe)}</div></div>
          </div>
          <div class="kv" style="margin-top:14px">
            ${state.debts.filter((d) => debtLeft(d) > 0).sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999')).slice(0, 4).map((d) => `
              <div class="kv-row"><span><i class="dot" style="background:${d.direction === 'owe' ? 'var(--expense)' : 'var(--income)'}"></i> ${esc(d.person)}${d.dueDate ? ` · due ${fmtDate(d.dueDate, { day: 'numeric', month: 'short' })}` : ''}</span><b>${bhd(debtLeft(d))}</b></div>`).join('') || '<div class="card-sub">No open debts</div>'}
          </div>
        </div>
      </div>
      ${showSavings() || showPlan() ? `<div class="grid grid-2">${showSavings() ? dashSavingsCard() : ''}${showPlan() ? dashWishlistCard() : ''}</div>` : ''}`;
  }

  const money = (n) => (ui.maskSavings ? 'BHD •••••' : bhd(n));

  function dashSavingsCard() {
    const total = sum(state.savings, accountBalance);
    return `
      <div class="card">
        <div class="card-head"><h3 class="card-title">Savings</h3><button class="link-btn" data-action="goto" data-view="savings">Open →</button></div>
        <div class="stat savings" style="padding:14px"><div class="stat-label">Total saved</div><div class="stat-value" style="font-size:19px">${money(total)}</div>
          <div class="stat-foot">${savedIn(ui.month) ? `${savedIn(ui.month) > 0 ? '+' : '−'}${money(Math.abs(savedIn(ui.month)))} this month` : 'Nothing moved this month'}</div></div>
        <div class="kv" style="margin-top:14px">
          ${state.savings.slice(0, 4).map((a) => `<div class="kv-row"><span>${esc(a.icon)} ${esc(a.name)}</span><b>${money(accountBalance(a))}</b></div>`).join('')
            || '<div class="card-sub">No savings account yet. <u data-action="goto" data-view="savings" style="cursor:pointer">Create one</u></div>'}
        </div>
      </div>`;
  }

  function dashWishlistCard() {
    const open = state.wishlist.filter((w) => w.status !== 'bought');
    const needed = sum(open, (w) => Math.max(0, w.price - (w.saved || 0)));
    return `
      <div class="card">
        <div class="card-head"><h3 class="card-title">Future purchases</h3><button class="link-btn" data-action="goto" data-view="plan">Plan →</button></div>
        ${open.length ? `<div class="summary-line" style="margin-bottom:8px"><span>${open.length} planned</span><span>Still needed <b>${bhd(needed)}</b></span></div>
          <div class="kv">${sortWishlist(open).slice(0, 5).map((w) => `<div class="kv-row"><span>${PRIORITIES[w.priority]?.[0] || PRIORITIES.medium[0]} ${esc(w.name)}${w.targetDate ? ` · ${fmtDate(w.targetDate, { month: 'short', year: 'numeric' })}` : ''}</span><b>${bhd(w.price)}</b></div>`).join('')}</div>`
          : empty('🛍️', 'Nothing planned yet.', '<button class="btn btn-primary btn-sm" data-action="add-wish">+ Add a future purchase</button>')}
      </div>`;
  }

  const sortWishlist = (list) => list.slice().sort((a, b) =>
    (['high', 'medium', 'low'].indexOf(a.priority) - ['high', 'medium', 'low'].indexOf(b.priority)) || (a.targetDate || '9999').localeCompare(b.targetDate || '9999'));

  // ---------- Savings ----------
  function renderSavings() {
    const total = sum(state.savings, accountBalance);
    const goals = state.savings.filter((a) => Number(a.goal) > 0);
    const goalTotal = sum(goals, (a) => a.goal);
    const goalSaved = sum(goals, (a) => Math.min(accountBalance(a), a.goal));
    const cur = currentPeriod();
    return `
      <div class="grid grid-3">
        <div class="stat savings"><div class="stat-label">Total savings</div><div class="stat-value">${money(total)}</div><div class="stat-foot">${state.savings.length} account${state.savings.length === 1 ? '' : 's'}</div></div>
        <div class="stat income"><div class="stat-label">Saved this month</div><div class="stat-value">${money(savedIn(cur))}</div><div class="stat-foot">${esc(periodLabel(cur))}</div></div>
        <div class="stat budget"><div class="stat-label">Goals reached</div><div class="stat-value">${goalTotal ? `${Math.round((goalSaved / goalTotal) * 100)}%` : '—'}</div><div class="stat-foot">${goalTotal ? `${money(goalSaved)} of ${money(goalTotal)}` : 'Add a goal to an account'}</div></div>
      </div>
      <div class="card">
        <div class="card-head">
          <h3 class="card-title">Your savings accounts</h3>
          <div class="btn-row">
            <button class="btn btn-sm" data-action="mask-savings">${ui.maskSavings ? 'Show amounts' : 'Hide amounts'}</button>
            <button class="btn btn-sm btn-primary" data-action="add-account">+ New account</button>
          </div>
        </div>
        <div class="grid grid-2">
          ${state.savings.length ? state.savings.map((a) => {
            const bal = accountBalance(a);
            const pct = a.goal ? Math.min(100, (bal / a.goal) * 100) : 0;
            return `
              <div class="card debt-card" style="box-shadow:none;background:var(--surface-2)">
                <div class="debt-top">
                  <div class="debt-person">
                    <span class="avatar" style="background:${esc(a.color)};font-size:20px">${esc(a.icon)}</span>
                    <div style="min-width:0"><div class="debt-name">${esc(a.name)}</div>
                      <div class="card-sub">${a.goal ? `Goal ${money(a.goal)}${bal >= a.goal ? ' · <span class="pill green">Reached</span>' : ''}` : 'No goal set'}</div></div>
                  </div>
                  <div class="debt-amt"><b style="color:var(--savings)">${money(bal)}</b></div>
                </div>
                ${a.goal ? `<div class="bar" style="--c:var(--savings)"><i style="width:${pct}%"></i></div><div class="card-sub">${Math.round(pct)}% of goal${bal < a.goal ? ` · ${money(a.goal - bal)} to go` : ''}</div>` : ''}
                <div class="btn-row">
                  <button class="btn btn-sm btn-income" data-action="save-in" data-id="${a.id}">Add money</button>
                  <button class="btn btn-sm" data-action="save-out" data-id="${a.id}" ${bal <= 0 ? 'disabled' : ''}>Take out</button>
                  <button class="btn btn-sm" data-action="edit-account" data-id="${a.id}">${svg('edit')}</button>
                  <button class="btn btn-sm btn-danger" data-action="del-account" data-id="${a.id}">${svg('trash')}</button>
                </div>
                ${a.entries.length ? `<details class="history"><summary>History (${a.entries.length})</summary><ul>
                  ${a.entries.slice().sort((x, y) => y.date.localeCompare(x.date)).map((e) => `<li><span>${fmtDate(e.date)}${e.note ? ` · ${esc(e.note)}` : ''}</span><span><b style="color:${e.amount >= 0 ? 'var(--income)' : 'var(--expense)'}">${e.amount >= 0 ? '+' : '−'}${money(Math.abs(e.amount))}</b> <button class="link-btn" data-action="del-entry" data-id="${a.id}" data-eid="${e.id}" title="Remove">✕</button></span></li>`).join('')}
                </ul></details>` : ''}
              </div>`;
          }).join('') : `<div class="span-2">${empty('🐷', 'Create a savings account to start tracking what you put aside.', '<button class="btn btn-primary" data-action="add-account">+ New savings account</button>')}</div>`}
        </div>
        <p class="card-sub" style="margin-bottom:0">Money you add here is taken from this month's balance but isn't counted as spending, so your budgets stay accurate. You can hide this section in Settings.</p>
      </div>`;
  }

  // ---------- Plan ahead ----------
  function renderPlan() {
    return `${wishlistCard()}${planCard()}`;
  }

  function wishlistCard() {
    const open = sortWishlist(state.wishlist.filter((w) => w.status !== 'bought'));
    const bought = state.wishlist.filter((w) => w.status === 'bought').sort((a, b) => (b.boughtDate || '').localeCompare(a.boughtDate || ''));
    const total = sum(open, (w) => w.price), aside = sum(open, (w) => Math.min(w.saved || 0, w.price));
    return `
      <div class="card">
        <div class="card-head"><h3 class="card-title">Future purchases</h3><button class="btn btn-sm btn-primary" data-action="add-wish">+ Add item</button></div>
        ${open.length ? `<div class="summary-line" style="margin-bottom:10px"><span>Planned <b>${bhd(total)}</b></span><span>Set aside <b style="color:var(--income)">${bhd(aside)}</b></span><span>Still needed <b style="color:var(--expense)">${bhd(total - aside)}</b></span></div>` : ''}
        <div class="grid grid-2">
          ${open.length ? open.map((w) => {
            const cat = catById(w.categoryId);
            const pct = w.price ? Math.min(100, ((w.saved || 0) / w.price) * 100) : 0;
            const late = w.targetDate && w.targetDate < todayStr();
            const [pIco, pLabel] = PRIORITIES[w.priority] || PRIORITIES.medium;
            return `
              <div class="card debt-card" style="box-shadow:none;background:var(--surface-2)">
                <div class="debt-top">
                  <div class="debt-person">${icon(cat)}
                    <div style="min-width:0"><div class="debt-name">${esc(w.name)}</div>
                      <div class="card-sub">${pIco} ${pLabel}${w.targetDate ? ` · <span class="${late ? 'pill red' : ''}">by ${fmtDate(w.targetDate, { day: 'numeric', month: 'short', year: 'numeric' })}</span>` : ''}</div></div>
                  </div>
                  <div class="debt-amt"><b>${bhd(w.price)}</b><small>${esc(cat.name)}</small></div>
                </div>
                ${w.note || w.link ? `<div class="card-sub">${w.note ? `${esc(w.note)}` : ''} ${/^https?:\/\//i.test(w.link || '') ? `<a href="${esc(w.link)}" target="_blank" rel="noopener" style="color:var(--primary);font-weight:700">Link</a>` : ''}</div>` : ''}
                <div class="bar" style="--c:var(--income)"><i style="width:${pct}%"></i></div>
                <div class="card-sub">${bhd(w.saved || 0)} set aside · ${bhd(Math.max(0, w.price - (w.saved || 0)))} to go</div>
                <div class="btn-row">
                  <button class="btn btn-sm" data-action="wish-aside" data-id="${w.id}">Set aside</button>
                  <button class="btn btn-sm btn-income" data-action="wish-bought" data-id="${w.id}">Bought</button>
                  <button class="btn btn-sm" data-action="edit-wish" data-id="${w.id}">${svg('edit')}</button>
                  <button class="btn btn-sm btn-danger" data-action="del-wish" data-id="${w.id}">${svg('trash')}</button>
                </div>
              </div>`;
          }).join('') : `<div class="span-2">${empty('🛍️', 'Add things you plan to buy: phone, furniture, a trip…', '<button class="btn btn-primary" data-action="add-wish">+ Add a future purchase</button>')}</div>`}
        </div>
        ${bought.length ? `<details class="history" style="margin-top:12px"><summary>Already bought (${bought.length})</summary><ul>
          ${bought.map((w) => `<li><span>${esc(w.name)} · ${fmtDate(w.boughtDate)}</span><span><b>${bhd(w.boughtPrice ?? w.price)}</b> <button class="link-btn" data-action="del-wish" data-id="${w.id}" title="Remove">✕</button></span></li>`).join('')}
        </ul></details>` : ''}
      </div>`;
  }

  function planCard() {
    const cur = currentPeriod();
    const key = shiftMonth(cur, ui.planOffset);
    const prevKey = shiftMonth(key, -1);
    const plan = state.plans[key] || { income: 0, savings: 0, byCategory: {} };
    const prevSpend = new Map(spendByCategory(prevKey).map((r) => [r.cat.id, r.total]));
    const prevIncome = sum(incomeIn(prevKey), (t) => t.amount);
    const start = periodStart(key), end = periodEnd(key);
    const purchases = state.wishlist.filter((w) => w.status !== 'bought' && w.targetDate && w.targetDate <= end && (w.targetDate >= start || ui.planOffset === 1));
    const purchaseTotal = sum(purchases, (w) => Math.max(0, w.price - (w.saved || 0)));
    const catTotal = sum(Object.values(plan.byCategory || {}));
    const income = Number(plan.income) || 0, savings = Number(plan.savings) || 0;
    const left = round3(income - catTotal - savings - purchaseTotal);
    const prevLabel = prevKey === cur ? 'This month so far' : periodLabel(prevKey);
    const pct = (v) => (income > 0 ? Math.max(0, Math.min(100, (v / income) * 100)) : 0);
    return `
      <div class="card">
        <div class="card-head">
          <h3 class="card-title">Budget plan</h3>
          <div class="month-switch" style="box-shadow:none">
            <button class="icon-btn" data-action="plan-shift" data-d="-1" ${ui.planOffset <= 0 ? 'disabled' : ''} aria-label="Previous">${svg('left')}</button>
            <span class="month-label" style="cursor:default">${ui.planOffset === 1 ? 'Next month · ' : ui.planOffset === 0 ? 'This month · ' : ''}${esc(periodLabel(key))}</span>
            <button class="icon-btn" data-action="plan-shift" data-d="1" ${ui.planOffset >= 6 ? 'disabled' : ''} aria-label="Next">${svg('right')}</button>
          </div>
        </div>
        <div class="grid grid-2">
          <div class="field"><label for="planIncome">Expected income</label>
            <div class="amount-input"><span>BHD</span><input class="input" id="planIncome" type="number" min="0" step="0.001" inputmode="decimal" placeholder="0.000" value="${income || ''}"></div>
            <span class="card-sub">${prevLabel}: ${bhd(prevIncome)}${prevIncome && !income ? ` · <button class="link-btn" data-action="plan-income-prev">Use this</button>` : ''}</span>
          </div>
          <div class="field"><label for="planSavings">Planned savings</label>
            <div class="amount-input"><span>BHD</span><input class="input" id="planSavings" type="number" min="0" step="0.001" inputmode="decimal" placeholder="0.000" value="${savings || ''}"></div>
            <span class="card-sub">${prevLabel}: ${bhd(savedIn(prevKey))} saved</span>
          </div>
        </div>

        <div class="plan-summary">
          <div class="plan-bar">
            <i style="width:${pct(catTotal)}%;background:var(--expense)" title="Expenses"></i>
            <i style="width:${pct(savings)}%;background:var(--savings)" title="Savings"></i>
            <i style="width:${pct(purchaseTotal)}%;background:var(--warn)" title="Purchases"></i>
          </div>
          <div class="kv">
            <div class="kv-row"><span>Expected income</span><b>${bhd(income)}</b></div>
            <div class="kv-row"><span><i class="dot" style="background:var(--expense)"></i>Planned expenses</span><b>−${bhd(catTotal)}</b></div>
            <div class="kv-row"><span><i class="dot" style="background:var(--savings)"></i>Savings</span><b>−${bhd(savings)}</b></div>
            <div class="kv-row"><span><i class="dot" style="background:var(--warn)"></i>Future purchases (${purchases.length})</span><b>−${bhd(purchaseTotal)}</b></div>
            <div class="kv-row" style="border-top:1px dashed var(--border);padding-top:10px;font-size:16px"><span style="color:var(--text);font-weight:800">${left >= 0 ? 'Left over' : 'Short by'}</span><b style="color:${left >= 0 ? 'var(--income)' : 'var(--expense)'}">${bhd(Math.abs(left))}</b></div>
          </div>
        </div>

        ${purchases.length ? `<div class="card-sub" style="margin:14px 0 4px;font-weight:700">Purchases due by ${fmtDate(end, { day: 'numeric', month: 'short' })}</div>
          <div class="kv">${purchases.map((w) => `<div class="kv-row"><span>${PRIORITIES[w.priority]?.[0] || PRIORITIES.medium[0]} ${esc(w.name)} · ${fmtDate(w.targetDate, { day: 'numeric', month: 'short' })}</span><b>${bhd(Math.max(0, w.price - (w.saved || 0)))}</b></div>`).join('')}</div>`
          : '<p class="card-sub">Future purchases with a target date in this month are added automatically.</p>'}

        <div class="card-head" style="margin-top:18px">
          <h3 class="card-title">Planned spending by category</h3>
          <div class="btn-row">
            <button class="btn btn-sm" data-action="plan-fill" data-src="budgets">Copy my budgets</button>
            <button class="btn btn-sm" data-action="plan-fill" data-src="last">Copy ${prevKey === cur ? 'this' : 'last'} month's spending</button>
          </div>
        </div>
        <div class="plan-table">
          <div class="plan-row plan-head"><span>Category</span><span>${esc(prevLabel)}</span><span>Planned</span></div>
          ${catsOf('expense').map((c) => `
            <div class="plan-row">
              <span class="rank-name"><span>${esc(c.icon)}</span><span>${esc(c.name)}</span></span>
              <span class="card-sub">${bhd(prevSpend.get(c.id) || 0)}</span>
              <input class="input limit-input" type="number" min="0" step="0.001" inputmode="decimal" placeholder="0" data-plan-cat="${c.id}" value="${plan.byCategory?.[c.id] || ''}" aria-label="Planned for ${esc(c.name)}">
            </div>`).join('')}
          <div class="plan-row plan-head"><span>Total</span><span>${bhd(sum([...prevSpend.values()]))}</span><span>${bhd(catTotal)}</span></div>
        </div>
        <div class="btn-row" style="margin-top:14px;justify-content:flex-end">
          <button class="btn btn-sm btn-danger" data-action="plan-clear">Clear plan</button>
          <button class="btn btn-primary" data-action="plan-apply" ${catTotal ? '' : 'disabled'}>Use this plan as my budgets</button>
        </div>
      </div>`;
  }

  function planFor(key) {
    state.plans[key] = state.plans[key] || { income: 0, savings: 0, byCategory: {} };
    state.plans[key].byCategory = state.plans[key].byCategory || {};
    return state.plans[key];
  }
  const planKey = () => shiftMonth(currentPeriod(), ui.planOffset);



  function renderTransactions() {
    const f = ui.txFilter;
    const all = txInMonth();
    const q = f.q.trim().toLowerCase();
    const list = sortTx(all.filter((t) =>
      (f.type === 'all' || t.type === f.type) &&
      (!f.category || t.categoryId === f.category) &&
      (!f.method || t.method === f.method) &&
      (!q || [t.place, t.note, catById(t.categoryId).name, String(t.amount)].join(' ').toLowerCase().includes(q))));

    const groups = new Map();
    list.forEach((t) => { if (!groups.has(t.date)) groups.set(t.date, []); groups.get(t.date).push(t); });
    const totalExp = sum(list.filter((t) => t.type === 'expense'), (t) => t.amount);
    const totalInc = sum(list.filter((t) => t.type === 'income'), (t) => t.amount);

    const catOptions = state.categories.map((c) => `<option value="${c.id}" ${f.category === c.id ? 'selected' : ''}>${esc(c.icon)} ${esc(c.name)}</option>`).join('');
    const methodOptions = METHODS.map((m) => `<option ${f.method === m ? 'selected' : ''}>${m}</option>`).join('');

    return `
      <div class="card">
        <div class="filters">
          <div class="seg" id="txType">
            ${['all', 'expense', 'income'].map((t) => `<button data-type="${t}" class="${f.type === t ? `active is-${t}` : ''}">${t === 'all' ? 'All' : t === 'expense' ? 'Expenses' : 'Income'}</button>`).join('')}
          </div>
          <select class="input" id="txCat"><option value="">All categories</option>${catOptions}</select>
          <select class="input" id="txMethod"><option value="">All payment methods</option>${methodOptions}</select>
          <input class="input" id="txSearch" type="search" placeholder="Search place, note, amount…" value="${esc(f.q)}">
        </div>
      </div>
      <div class="card">
        <div class="card-head">
          <div class="summary-line">
            <span>${list.length} record${list.length === 1 ? '' : 's'}</span>
            <span>Spent <b style="color:var(--expense)">${bhd(totalExp)}</b></span>
            <span>Received <b style="color:var(--income)">${bhd(totalInc)}</b></span>
          </div>
          <div class="btn-row">
            <button class="btn btn-sm btn-expense" data-action="add-expense">Expense</button>
            <button class="btn btn-sm btn-income" data-action="add-income">Income</button>
          </div>
        </div>
        ${list.length ? [...groups.entries()].map(([date, items]) => {
          const dayTotal = sum(items.filter((t) => t.type === 'expense'), (t) => t.amount);
          return `<div class="day-group"><div class="day-head"><span>${dayHeading(date)}</span><span>${dayTotal ? `−${bhd(dayTotal)}` : ''}</span></div>
            <div class="tx-list">${items.map((t) => txRow(t)).join('')}</div></div>`;
        }).join('') : empty('🔍', all.length ? 'No transactions match these filters.' : `No transactions in ${periodLabel(ui.month)} yet.`)}
      </div>`;
  }

  function renderBudgets() {
    const byCat = new Map(spendByCategory(ui.month).map((r) => [r.cat.id, r.total]));
    const spent = sum(expensesIn(ui.month), (t) => t.amount);
    const overall = state.budgets.overall;
    const pct = overall > 0 ? (spent / overall) * 100 : 0;
    const totalCatLimits = sum(Object.values(state.budgets.byCategory));
    const isCurrent = ui.month === currentPeriod();
    const daysLeft = isCurrent ? periodDays(ui.month) - daysElapsed(ui.month) + 1 : 0;

    return `
      <div class="grid grid-3">
        <div class="card span-2">
          <div class="card-head"><h3 class="card-title">Overall monthly budget</h3></div>
          <div class="form-grid" style="align-items:end">
            <div class="field"><label for="overallBudget">Monthly limit (applies to every month)</label>
              <div class="amount-input"><span>BHD</span><input class="input" id="overallBudget" type="number" min="0" step="0.001" inputmode="decimal" value="${overall || ''}" placeholder="0.000"></div>
            </div>
            <div class="kv">
              <div class="kv-row"><span>Spent this month</span><b>${bhd(spent)}</b></div>
              <div class="kv-row"><span>${overall && spent > overall ? 'Over by' : 'Remaining'}</span><b style="color:${overall && spent > overall ? 'var(--expense)' : 'var(--income)'}">${overall ? bhd(Math.abs(overall - spent)) : '—'}</b></div>
              ${isCurrent ? `<div class="kv-row"><span>Days left until next salary</span><b>${daysLeft}</b></div>` : ''}
              ${isCurrent && overall > spent ? `<div class="kv-row"><span>Safe to spend per day</span><b>${bhd((overall - spent) / daysLeft)}</b></div>` : ''}
            </div>
          </div>
          ${overall ? `<div class="bar" style="margin-top:16px;height:14px;--c:${budgetColor(pct)}"><i style="width:${Math.min(100, pct)}%"></i></div>
            <div class="card-sub" style="margin-top:6px">${Math.round(pct)}% used</div>` : ''}
        </div>
        <div class="card">
          <div class="card-head"><h3 class="card-title">Planning</h3></div>
          <div class="kv">
            <div class="kv-row"><span>Category limits total</span><b>${bhd(totalCatLimits)}</b></div>
            <div class="kv-row"><span>Overall budget</span><b>${overall ? bhd(overall) : '—'}</b></div>
            <div class="kv-row"><span>Unassigned</span><b>${overall ? bhd(overall - totalCatLimits) : '—'}</b></div>
          </div>
          <p class="card-sub" style="margin-bottom:0">Tip: give each category a limit. Leave it empty if you don't want to track one.</p>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3 class="card-title">Category budgets — ${periodLabel(ui.month)}</h3><button class="btn btn-sm btn-expense" data-action="add-cat" data-type="expense">+ New category</button></div>
        ${catsOf('expense').map((c) => {
          const s = byCat.get(c.id) || 0;
          const lim = Number(state.budgets.byCategory[c.id]) || 0;
          const p = lim ? (s / lim) * 100 : 0;
          return `
            <div class="budget-row">
              ${icon(c)}
              <div>
                <div class="budget-top">
                  <span class="budget-name">${esc(c.name)} ${lim ? (p > 100 ? '<span class="pill red">Over</span>' : p >= 100 ? '<span class="pill amber">Full</span>' : p >= 80 ? '<span class="pill amber">Close</span>' : '<span class="pill green">On track</span>') : ''}</span>
                  <span style="display:flex;gap:10px;align-items:center">
                    <span class="budget-nums">${bhd(s)}${lim ? ` / ${bhd(lim)}` : ''}</span>
                    <input class="input limit-input" type="number" min="0" step="0.001" inputmode="decimal" placeholder="Limit" data-budget="${c.id}" value="${lim || ''}" aria-label="Budget for ${esc(c.name)}">
                  </span>
                </div>
                <div class="bar" style="--c:${lim ? budgetColor(p) : c.color}"><i style="width:${lim ? Math.min(100, p) : (s > 0 ? 100 : 0)}%;${lim ? '' : 'opacity:.35'}"></i></div>
              </div>
            </div>`;
        }).join('')}
      </div>`;
  }

  function renderDebts() {
    const tab = ui.debtTab;
    const owe = state.debts.filter((d) => d.direction === 'owe');
    const owed = state.debts.filter((d) => d.direction === 'owed');
    const list = (tab === 'owe' ? owe : owed).slice().sort((a, b) => {
      const ao = debtLeft(a) === 0, bo = debtLeft(b) === 0;
      if (ao !== bo) return ao ? 1 : -1;
      return (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
    });
    const avatarColor = (name) => PALETTE[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];

    return `
      <div class="grid grid-3">
        <div class="stat debt"><div class="stat-label">I owe (remaining)</div><div class="stat-value">${bhd(sum(owe, debtLeft))}</div><div class="stat-foot">${owe.filter((d) => debtLeft(d) > 0).length} open</div></div>
        <div class="stat income"><div class="stat-label">Owed to me (remaining)</div><div class="stat-value">${bhd(sum(owed, debtLeft))}</div><div class="stat-foot">${owed.filter((d) => debtLeft(d) > 0).length} open</div></div>
        <div class="stat hero"><div class="stat-label">Net position</div><div class="stat-value">${bhd(sum(owed, debtLeft) - sum(owe, debtLeft))}</div><div class="stat-foot">Owed to me minus what I owe</div></div>
      </div>
      <div class="card">
        <div class="card-head">
          <div class="seg" id="debtTab">
            <button data-tab="owe" class="${tab === 'owe' ? 'active is-expense' : ''}">I owe</button>
            <button data-tab="owed" class="${tab === 'owed' ? 'active is-income' : ''}">Owed to me</button>
          </div>
          <button class="btn btn-primary btn-sm" data-action="add-debt">+ New debt</button>
        </div>
        <div class="grid grid-2">
          ${list.length ? list.map((d) => {
            const left = debtLeft(d), paid = debtPaid(d);
            const pct = d.amount ? (paid / d.amount) * 100 : 0;
            const overdue = left > 0 && d.dueDate && d.dueDate < todayStr();
            const initials = d.person.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
            return `
              <div class="card debt-card" style="box-shadow:none;background:var(--surface-2)">
                <div class="debt-top">
                  <div class="debt-person">
                    <span class="avatar" style="background:${avatarColor(d.person)}">${esc(initials || '?')}</span>
                    <div style="min-width:0">
                      <div class="debt-name">${esc(d.person)}</div>
                      <div class="card-sub">${left === 0 ? '<span class="pill green">Settled</span>' : overdue ? `<span class="pill red">Overdue · ${fmtDate(d.dueDate)}</span>` : d.dueDate ? `Due ${fmtDate(d.dueDate)}` : 'No due date'}</div>
                    </div>
                  </div>
                  <div class="debt-amt"><b style="color:${d.direction === 'owe' ? 'var(--expense)' : 'var(--income)'}">${bhd(left)}</b><small>of ${bhd(d.amount)}</small></div>
                </div>
                ${d.note ? `<div class="card-sub">${esc(d.note)}</div>` : ''}
                <div class="bar" style="--c:${d.direction === 'owe' ? 'var(--warn)' : 'var(--income)'}"><i style="width:${Math.min(100, pct)}%"></i></div>
                <div class="card-sub">${bhd(paid)} ${d.direction === 'owe' ? 'paid back' : 'received'} · ${Math.round(pct)}%</div>
                <div class="btn-row">
                  ${left > 0 ? `<button class="btn btn-sm ${d.direction === 'owe' ? 'btn-expense' : 'btn-income'}" data-action="pay-debt" data-id="${d.id}">${d.direction === 'owe' ? 'Record payment' : 'Record received'}</button>` : ''}
                  <button class="btn btn-sm" data-action="edit-debt" data-id="${d.id}">Edit</button>
                  <button class="btn btn-sm btn-danger" data-action="del-debt" data-id="${d.id}">${svg('trash')}</button>
                </div>
                ${d.payments.length ? `<details class="history"><summary>Payment history (${d.payments.length})</summary><ul>
                  ${d.payments.slice().sort((a, b) => b.date.localeCompare(a.date)).map((p) => `<li><span>${fmtDate(p.date)}</span><span><b>${bhd(p.amount)}</b> <button class="link-btn" data-action="del-payment" data-id="${d.id}" data-pid="${p.id}" title="Remove payment">✕</button></span></li>`).join('')}
                </ul></details>` : ''}
              </div>`;
          }).join('') : `<div class="span-2">${empty(tab === 'owe' ? '🙌' : '📭', tab === 'owe' ? "You don't owe anyone. Nice!" : 'Nobody owes you money right now.', '<button class="btn btn-primary" data-action="add-debt">+ Add a debt</button>')}</div>`}
        </div>
      </div>`;
  }

  function renderInsights() {
    const exp = expensesIn(ui.month);
    const spent = sum(exp, (t) => t.amount);
    const prevSpent = sum(expensesIn(shiftMonth(ui.month, -1)), (t) => t.amount);
    const byCat = spendByCategory(ui.month);

    const groupBy = (keyFn) => {
      const m = new Map();
      exp.forEach((t) => { const k = keyFn(t); m.set(k, { total: round3((m.get(k)?.total || 0) + t.amount), count: (m.get(k)?.count || 0) + 1 }); });
      return [...m.entries()].sort((a, b) => b[1].total - a[1].total);
    };
    const places = groupBy((t) => (t.place || '').trim() || 'Not specified').slice(0, 10)
      .map(([name, v], i) => ({ name: `${name} (${v.count}×)`, total: v.total, color: PALETTE[(i * 3) % PALETTE.length], icon: '' }));
    const methodIcons = {};
    const methods = groupBy((t) => t.method || 'Other')
      .map(([name, v], i) => ({ name, total: v.total, color: PALETTE[(i * 4 + 8) % PALETTE.length], icon: methodIcons[name] || '' }));

    // weekday pattern
    const wd = Array(7).fill(0);
    exp.forEach((t) => { const [y, m, d] = t.date.split('-').map(Number); wd[new Date(y, m - 1, d).getDay()] += t.amount; });
    const wdLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const months = Array.from({ length: 6 }, (_, i) => shiftMonth(ui.month, i - 5));
    const trendInc = months.map((k) => sum(incomeIn(k), (t) => t.amount));
    const trendExp = months.map((k) => sum(expensesIn(k), (t) => t.amount));

    const daysCounted = daysElapsed(ui.month);
    const biggest = exp.slice().sort((a, b) => b.amount - a.amount)[0];
    const change = prevSpent ? ((spent - prevSpent) / prevSpent) * 100 : null;
    const topCat = byCat[0];

    return `
      <div class="grid grid-4">
        <div class="stat expense"><div class="stat-label">Daily average</div><div class="stat-value">${bhd(spent / daysCounted)}</div><div class="stat-foot">over ${daysCounted} day${daysCounted === 1 ? '' : 's'}</div></div>
        <div class="stat budget"><div class="stat-label">vs last month</div><div class="stat-value">${change === null ? '—' : `${change > 0 ? '▲' : '▼'} ${Math.abs(Math.round(change))}%`}</div><div class="stat-foot">Last month: ${bhd(prevSpent)}</div></div>
        <div class="stat hero"><div class="stat-label">Top category</div><div class="stat-value" style="font-size:19px">${topCat ? `${esc(topCat.cat.icon)} ${esc(topCat.cat.name)}` : '—'}</div><div class="stat-foot">${topCat ? bhd(topCat.total) : 'No spending yet'}</div></div>
        <div class="stat debt"><div class="stat-label">Biggest expense</div><div class="stat-value">${biggest ? bhd(biggest.amount) : '—'}</div><div class="stat-foot">${biggest ? esc(biggest.place || catById(biggest.categoryId).name) + ' · ' + fmtDate(biggest.date, { day: 'numeric', month: 'short' }) : '—'}</div></div>
      </div>

      <div class="grid grid-2">
        <div class="card">
          <div class="card-head"><h3 class="card-title">Spending by category</h3><span class="card-sub">${bhd(spent)}</span></div>
          ${rankList(byCat.map((r) => ({ name: r.cat.name, icon: r.cat.icon, total: r.total, color: r.cat.color })), spent, 'No spending this month.')}
        </div>
        <div class="card">
          <div class="card-head"><h3 class="card-title">Where you spend most</h3><span class="card-sub">Top places</span></div>
          ${rankList(places, spent, 'Add a place to your expenses to see where your money goes.')}
        </div>
      </div>

      <div class="grid grid-2">
        <div class="card">
          <div class="card-head"><h3 class="card-title">Income vs spending — last 6 budget months</h3></div>
          ${barChart(months.map((k) => periodLabel(k, true)), [
            { label: 'Income', values: trendInc, color: '#4caf8e' },
            { label: 'Spending', values: trendExp, color: '#d9665b' },
          ], { height: 200 })}
          <div class="chart-legend"><span><i style="background:#4caf8e"></i>Income</span><span><i style="background:#d9665b"></i>Spending</span></div>
        </div>
        <div class="card">
          <div class="card-head"><h3 class="card-title">Payment methods</h3></div>
          ${rankList(methods, spent, 'No spending this month.')}
          <div class="card-head" style="margin-top:18px"><h3 class="card-title">By day of week</h3></div>
          ${spent ? barChart(wdLabels, [{ label: 'Spent', values: wd, color: '#7b8cde' }], { height: 150 }) : empty('🗓️', 'No data yet.')}
        </div>
      </div>`;
  }

  function renderSettings() {
    const themeBtn = (v, label) => `<button data-theme-set="${v}" class="${state.settings.theme === v ? 'active' : ''}">${label}</button>`;
    const catItem = (c) => `
      <div class="cat-item">
        <span class="emoji" style="background:color-mix(in srgb, ${c.color} 18%, transparent)">${esc(c.icon)}</span>
        <span class="name">${esc(c.name)}</span>
        <button class="link-btn" data-action="edit-cat" data-id="${c.id}" title="Edit">${svg('edit')}</button>
        <button class="link-btn" data-action="del-cat" data-id="${c.id}" title="Delete">${svg('trash')}</button>
      </div>`;
    const cur = currentPeriod();
    const startWhy = state.settings.cycleOverrides?.[cur] ? 'set by you'
      : (cycleDay() > 1 && state.settings.salaryStart !== false && salaryDateNear(cur)) ? 'started on your salary day' : `day ${cycleDay()}`;
    return `
      ${syncCard()}
      <div class="card">
        <div class="card-head"><h3 class="card-title">Sections</h3></div>
        <div class="grid" style="gap:10px">
          <label class="toggle-row"><span><b>Savings</b><br><span class="card-sub">Savings accounts, goals and the savings card on the dashboard</span></span>
            <input type="checkbox" class="switch" id="showSavings" ${showSavings() ? 'checked' : ''}></label>
          <label class="toggle-row"><span><b>Plan ahead</b><br><span class="card-sub">Future purchases and next month's budget plan</span></span>
            <input type="checkbox" class="switch" id="showPlan" ${showPlan() ? 'checked' : ''}></label>
        </div>
        <p class="card-sub" style="margin-bottom:0">Hiding a section only hides it from view. Nothing is deleted, and you can turn it back on any time.</p>
      </div>
      <div class="card">
        <div class="card-head"><h3 class="card-title">Budget month</h3><span class="pill">Now: ${esc(periodLabel(cur))}</span></div>
        <p class="card-sub" style="margin-top:0">Start each month on the day your salary arrives, so budgets and totals match your pay cycle.</p>
        <div class="form-grid" style="align-items:center">
          <div class="field"><label for="cycleDay">My month starts on day</label>
            <select class="input" id="cycleDay">${Array.from({ length: 31 }, (_, i) => i + 1).map((d) => `<option value="${d}" ${d === cycleDay() ? 'selected' : ''}>${d === 1 ? '1 (normal calendar month)' : d}</option>`).join('')}</select>
          </div>
          <label style="display:flex;gap:10px;align-items:center;font-weight:600">
            <input type="checkbox" id="salaryStart" ${state.settings.salaryStart !== false ? 'checked' : ''} ${cycleDay() === 1 ? 'disabled' : ''} style="width:18px;height:18px;flex:none">
            Start on the day my salary actually arrives (if it comes up to ${SALARY_WINDOW} days early or late)
          </label>
        </div>
        <p class="card-sub" style="margin-bottom:0">Current month: <b>${esc(periodLabel(cur))}</b> (${startWhy}). You can also change any single month with the button next to the month at the top.</p>
      </div>
      <div class="card">
        <div class="card-head"><h3 class="card-title">Expense categories</h3><button class="btn btn-sm btn-expense" data-action="add-cat" data-type="expense">+ Add</button></div>
        <div class="cat-manage">${catsOf('expense').map(catItem).join('')}</div>
      </div>
      <div class="card">
        <div class="card-head"><h3 class="card-title">Income categories</h3><button class="btn btn-sm btn-income" data-action="add-cat" data-type="income">+ Add</button></div>
        <div class="cat-manage">${catsOf('income').map(catItem).join('')}</div>
      </div>
      <div class="grid grid-2">
        <div class="card">
          <div class="card-head"><h3 class="card-title">Appearance</h3></div>
          <div class="seg">${themeBtn('auto', 'Auto')}${themeBtn('light', 'Light')}${themeBtn('dark', 'Dark')}</div>
        </div>
        <div class="card">
          <div class="card-head"><h3 class="card-title">Backup & data</h3></div>
          <p class="card-sub" style="margin-top:0">${syncInfo().user ? 'Your data is synced to your account. A backup file is still handy for safekeeping.' : 'Without sign-in, your data is saved only in this browser. Download a backup regularly so you never lose it.'}</p>
          <div class="btn-row">
            <button class="btn btn-primary btn-sm" data-action="export-json">Backup (JSON)</button>
            <button class="btn btn-sm" data-action="import-json">Restore backup</button>
            <button class="btn btn-sm" data-action="export-csv">Export CSV</button>
            <button class="btn btn-sm" data-action="demo">Load demo data</button>
            <button class="btn btn-sm btn-danger" data-action="reset">Erase all data</button>
          </div>
          <input type="file" id="importFile" accept="application/json,.json" hidden>
        </div>
      </div>
      <p class="card-sub" style="text-align:center">${state.transactions.length} transactions · ${state.debts.length} debts · ${state.categories.length} categories</p>`;
  }

  // ---------- Cloud sync UI ----------
  const SYNC_LABELS = {
    loading: ['', 'Starting sync…'],
    signedout: ['', 'Sign in to sync'],
    connecting: ['', 'Connecting…'],
    waiting: ['', 'Waiting for internet'],
    syncing: ['', 'Syncing…'],
    synced: ['', 'Synced'],
    offline: ['', 'Offline: will sync'],
    error: ['', 'Sync problem'],
    unavailable: ['', 'Sync unavailable'],
  };
  const syncInfo = () => window.BudgetSync?.info || { status: syncUnavailable ? 'unavailable' : 'loading', user: null, error: '' };
  let syncUnavailable = false;

  function renderSyncBadge() {
    const info = syncInfo();
    const [ico, label] = SYNC_LABELS[info.status] || SYNC_LABELS.loading;
    const el = $('#syncBadge');
    el.className = `sync-badge is-${info.status}`;
    el.innerHTML = `<span class="sync-dot"></span><span class="sync-text">${label}</span>`;
    el.title = info.error || label;
  }

  function syncCard() {
    const info = syncInfo();
    const [ico, label] = SYNC_LABELS[info.status] || SYNC_LABELS.loading;
    const u = info.user;
    const body = u ? `
      <div class="sync-user">
        ${u.photo ? `<img class="avatar" src="${esc(u.photo)}" alt="" referrerpolicy="no-referrer">` : `<span class="avatar" style="background:var(--primary)">${esc((u.name || u.email || '?')[0].toUpperCase())}</span>`}
        <div style="min-width:0;flex:1">
          <div class="debt-name">${esc(u.name || 'Signed in')}</div>
          <div class="card-sub" style="overflow:hidden;text-overflow:ellipsis">${esc(u.email)}</div>
        </div>
        <button class="btn btn-sm" data-action="sync-signout">Sign out</button>
      </div>
      <p class="card-sub" style="margin-bottom:0">Everything you add here appears on every phone or computer where you sign in with this account, and changes made offline sync when you're back online.</p>`
      : `
      <p class="card-sub" style="margin-top:0">Sign in with Google to back up your data and keep it the same on every phone and computer you use.</p>
      <button class="btn btn-primary" data-action="sync-signin" ${['loading', 'unavailable', 'connecting'].includes(info.status) ? 'disabled' : ''}>
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
        Sign in with Google
      </button>`;
    return `
      <div class="card">
        <div class="card-head"><h3 class="card-title">Cloud sync</h3><span class="pill sync-pill is-${info.status}"><span class="sync-dot"></span>${label}</span></div>
        ${body}
        ${info.error ? `<div class="alert red" style="margin-top:12px">${esc(info.error)}</div>` : ''}
      </div>`;
  }

  const RENDERERS = {
    dashboard: renderDashboard, transactions: renderTransactions, budgets: renderBudgets,
    debts: renderDebts, insights: renderInsights, settings: renderSettings,
    savings: renderSavings, plan: renderPlan,
  };

  function render() {
    $('#viewTitle').textContent = VIEW_TITLES[ui.view];
    $('#monthLabel').textContent = periodLabel(ui.month);
    if ((ui.view === 'savings' && !showSavings()) || (ui.view === 'plan' && !showPlan())) ui.view = 'dashboard';
    $('.topbar .month-switch').hidden = ['settings', 'debts', 'savings', 'plan'].includes(ui.view);
    $('.nav-item[data-view="savings"]').hidden = !showSavings();
    $('.nav-item[data-view="plan"]').hidden = !showPlan();
    $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === ui.view));
    renderSyncBadge();
    $('#view').innerHTML = RENDERERS[ui.view]();
    bindViewInputs();
  }

  // Inputs that need direct listeners (they re-render on change)
  function bindViewInputs() {
    const v = $('#view');
    if (ui.view === 'transactions') {
      $$('#txType button', v).forEach((b) => b.onclick = () => { ui.txFilter.type = b.dataset.type; render(); });
      $('#txCat', v).onchange = (e) => { ui.txFilter.category = e.target.value; render(); };
      $('#txMethod', v).onchange = (e) => { ui.txFilter.method = e.target.value; render(); };
      const s = $('#txSearch', v);
      s.oninput = (e) => {
        ui.txFilter.q = e.target.value;
        const pos = e.target.selectionStart;
        render();
        const n = $('#txSearch'); n.focus(); n.setSelectionRange(pos, pos);
      };
    }
    if (ui.view === 'budgets') {
      $('#overallBudget', v).onchange = (e) => { state.budgets.overall = Math.max(0, round3(e.target.value)); save(); render(); toast('Monthly budget saved'); };
      $$('[data-budget]', v).forEach((inp) => inp.onchange = () => {
        const val = Math.max(0, round3(inp.value));
        if (val) state.budgets.byCategory[inp.dataset.budget] = val;
        else delete state.budgets.byCategory[inp.dataset.budget];
        save(); render(); toast('Category budget saved');
      });
    }
    if (ui.view === 'plan') {
      const num = (el) => Math.max(0, round3(el.value));
      $('#planIncome', v).onchange = (e) => { planFor(planKey()).income = num(e.target); save(); render(); };
      $('#planSavings', v).onchange = (e) => { planFor(planKey()).savings = num(e.target); save(); render(); };
      $$('[data-plan-cat]', v).forEach((inp) => inp.onchange = () => {
        const plan = planFor(planKey()), val = num(inp);
        if (val) plan.byCategory[inp.dataset.planCat] = val; else delete plan.byCategory[inp.dataset.planCat];
        save(); render();
      });
    }
    if (ui.view === 'debts') {
      $$('#debtTab button', v).forEach((b) => b.onclick = () => { ui.debtTab = b.dataset.tab; render(); });
    }
    if (ui.view === 'settings') {
      $$('[data-theme-set]', v).forEach((b) => b.onclick = () => { state.settings.theme = b.dataset.themeSet; save(); applyTheme(); render(); });
      $('#importFile', v).onchange = importJson;
      $('#showSavings', v).onchange = (e) => { state.settings.showSavings = e.target.checked; save(); render(); toast(e.target.checked ? 'Savings shown' : 'Savings hidden'); };
      $('#showPlan', v).onchange = (e) => { state.settings.showPlan = e.target.checked; save(); render(); toast(e.target.checked ? 'Plan shown' : 'Plan hidden'); };
      $('#cycleDay', v).onchange = (e) => { state.settings.cycleDay = Number(e.target.value); save(); ui.month = currentPeriod(); render(); toast('Budget month updated'); };
      $('#salaryStart', v).onchange = (e) => { state.settings.salaryStart = e.target.checked; save(); ui.month = currentPeriod(); render(); };
    }
  }

  // ---------- Transaction form ----------
  function openTxForm(type = 'expense', existing = null) {
    const t = existing ? { ...existing } : { type, amount: '', categoryId: '', date: todayStr(), place: '', method: 'Cash', note: '' };
    const placeSuggestions = [...new Set(state.transactions.map((x) => x.place).filter(Boolean))].slice(0, 50);

    const draw = () => {
      const cats = catsOf(t.type);
      if (!cats.some((c) => c.id === t.categoryId)) t.categoryId = cats[0]?.id || '';
      openModal(`
        <div class="modal-head"><h2>${existing ? 'Edit' : 'New'} ${t.type === 'expense' ? 'expense' : 'income'}</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
        <div class="seg" id="fType">
          <button type="button" data-type="expense" class="${t.type === 'expense' ? 'active is-expense' : ''}">Expense</button>
          <button type="button" data-type="income" class="${t.type === 'income' ? 'active is-income' : ''}">Income</button>
        </div>
        <form id="txForm" class="form-grid" autocomplete="off">
          <div class="field full"><label for="fAmount">Amount</label>
            <div class="amount-input"><span>BHD</span><input class="input" id="fAmount" type="number" min="0.001" step="0.001" inputmode="decimal" placeholder="0.000" value="${t.amount}" required></div>
          </div>
          <div class="field full"><label>Category</label>
            <div class="cat-picker">${cats.map((c) => `
              <button type="button" class="cat-chip ${c.id === t.categoryId ? 'active' : ''}" data-cat="${c.id}" style="--c:${c.color}">
                <span class="emoji" style="background:color-mix(in srgb, ${c.color} 20%, transparent)">${esc(c.icon)}</span>${esc(c.name)}
              </button>`).join('')}
              <button type="button" class="cat-chip add-chip" data-newcat><span class="emoji">+</span>New category</button>
            </div>
          </div>
          <div class="field"><label for="fDate">Date</label><input class="input" id="fDate" type="date" value="${t.date}" required></div>
          <div class="field"><label for="fMethod">Payment method</label>
            <select class="input" id="fMethod">${METHODS.map((m) => `<option ${t.method === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
          </div>
          <div class="field full"><label for="fPlace">${t.type === 'expense' ? 'Place / shop (where did you spend?)' : 'From (who paid you?)'}</label>
            <input class="input" id="fPlace" list="placeList" maxlength="80" placeholder="${t.type === 'expense' ? 'e.g. Lulu Hypermarket, City Centre' : 'e.g. Employer'}" value="${esc(t.place)}">
            <datalist id="placeList">${placeSuggestions.map((p) => `<option value="${esc(p)}">`).join('')}</datalist>
          </div>
          <div class="field full"><label for="fNote">Note (optional)</label><input class="input" id="fNote" maxlength="140" placeholder="Anything to remember" value="${esc(t.note)}"></div>
        </form>
        <div class="modal-foot">
          <button class="btn" data-close>Cancel</button>
          <button class="btn ${t.type === 'expense' ? 'btn-expense' : 'btn-income'}" type="submit" form="txForm">Save</button>
        </div>`, (root) => {
        const capture = () => {
          t.amount = $('#fAmount', root).value; t.date = $('#fDate', root).value;
          t.method = $('#fMethod', root).value; t.place = $('#fPlace', root).value; t.note = $('#fNote', root).value;
        };
        $$('#fType button', root).forEach((b) => b.onclick = () => { capture(); t.type = b.dataset.type; draw(); });
        $('[data-newcat]', root).onclick = () => {
          capture();
          openCatForm(t.type, null, (cat) => { if (cat) t.categoryId = cat.id; draw(); });
        };
        $$('[data-cat]', root).forEach((b) => b.onclick = () => {
          t.categoryId = b.dataset.cat;
          $$('[data-cat]', root).forEach((x) => x.classList.toggle('active', x === b));
        });
        $('#txForm', root).onsubmit = (e) => {
          e.preventDefault();
          capture();
          const amount = round3(t.amount);
          if (!(amount > 0)) { toast('Please enter an amount above 0'); return; }
          if (!t.categoryId) { toast('Please pick a category'); return; }
          const rec = {
            id: existing?.id || uid(), type: t.type, amount, categoryId: t.categoryId, date: t.date || todayStr(),
            place: t.place.trim(), method: t.method, note: t.note.trim(), createdAt: existing?.createdAt || Date.now(),
          };
          if (existing) state.transactions = state.transactions.map((x) => (x.id === rec.id ? rec : x));
          else state.transactions.push(rec);
          save(); closeModal();
          ui.month = periodKeyOf(rec.date);
          render();
          toast(existing ? 'Updated' : rec.type === 'expense' ? `Expense of ${bhd(amount)} saved` : `Income of ${bhd(amount)} saved`);
        };
        if (!existing) setTimeout(() => $('#fAmount', root)?.focus(), 50);
      });
    };
    draw();
  }

  // ---------- Debt forms ----------
  function openDebtForm(existing = null) {
    const d = existing ? { ...existing } : { direction: ui.debtTab, person: '', amount: '', dueDate: '', note: '' };
    const draw = () => openModal(`
      <div class="modal-head"><h2>${existing ? 'Edit debt' : 'New debt'}</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <div class="seg" id="dDir">
        <button type="button" data-dir="owe" class="${d.direction === 'owe' ? 'active is-expense' : ''}">I owe someone</button>
        <button type="button" data-dir="owed" class="${d.direction === 'owed' ? 'active is-income' : ''}">Someone owes me</button>
      </div>
      <form id="debtForm" class="form-grid" autocomplete="off">
        <div class="field full"><label for="dPerson">${d.direction === 'owe' ? 'Who do you owe?' : 'Who owes you?'}</label><input class="input" id="dPerson" maxlength="60" required placeholder="Name, bank or shop" value="${esc(d.person)}"></div>
        <div class="field full"><label for="dAmount">Total amount</label>
          <div class="amount-input"><span>BHD</span><input class="input" id="dAmount" type="number" min="0.001" step="0.001" inputmode="decimal" required placeholder="0.000" value="${d.amount}"></div>
        </div>
        <div class="field"><label for="dDue">Due date (optional)</label><input class="input" id="dDue" type="date" value="${d.dueDate || ''}"></div>
        <div class="field"><label for="dNote">Note (optional)</label><input class="input" id="dNote" maxlength="140" placeholder="e.g. Car loan" value="${esc(d.note)}"></div>
      </form>
      <div class="modal-foot">
        <button class="btn" data-close>Cancel</button>
        <button class="btn btn-primary" type="submit" form="debtForm">Save</button>
      </div>`, (root) => {
      const capture = () => { d.person = $('#dPerson', root).value; d.amount = $('#dAmount', root).value; d.dueDate = $('#dDue', root).value; d.note = $('#dNote', root).value; };
      $$('#dDir button', root).forEach((b) => b.onclick = () => { capture(); d.direction = b.dataset.dir; draw(); });
      $('#debtForm', root).onsubmit = (e) => {
        e.preventDefault(); capture();
        const amount = round3(d.amount);
        if (!(amount > 0) || !d.person.trim()) { toast('Please fill in name and amount'); return; }
        const rec = {
          id: existing?.id || uid(), direction: d.direction, person: d.person.trim(), amount,
          dueDate: d.dueDate, note: d.note.trim(), createdAt: existing?.createdAt || Date.now(), payments: existing?.payments || [],
        };
        if (existing) state.debts = state.debts.map((x) => (x.id === rec.id ? rec : x));
        else state.debts.push(rec);
        ui.debtTab = rec.direction;
        save(); closeModal(); render(); toast('Debt saved');
      };
    });
    draw();
  }

  function openPaymentForm(debt) {
    const left = debtLeft(debt);
    const owe = debt.direction === 'owe';
    openModal(`
      <div class="modal-head"><h2>${owe ? `Pay ${esc(debt.person)}` : `Received from ${esc(debt.person)}`}</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <p class="card-sub" style="margin:0">Remaining: <b>${bhd(left)}</b></p>
      <form id="payForm" class="form-grid">
        <div class="field full"><label for="pAmount">Amount</label>
          <div class="amount-input"><span>BHD</span><input class="input" id="pAmount" type="number" min="0.001" max="${left}" step="0.001" inputmode="decimal" required value="${left}"></div>
        </div>
        <div class="field"><label for="pDate">Date</label><input class="input" id="pDate" type="date" value="${todayStr()}" required></div>
        <div class="field"><label for="pMethod">Payment method</label><select class="input" id="pMethod">${METHODS.map((m) => `<option>${m}</option>`).join('')}</select></div>
        <label class="full" style="display:flex;gap:10px;align-items:center;font-weight:600">
          <input type="checkbox" id="pLog" checked style="width:18px;height:18px">
          Also record as ${owe ? 'an expense (Debt Payment)' : 'income (Debt Repaid to Me)'}
        </label>
      </form>
      <div class="modal-foot">
        <button class="btn" data-close>Cancel</button>
        <button class="btn ${owe ? 'btn-expense' : 'btn-income'}" type="submit" form="payForm">Save payment</button>
      </div>`, (root) => {
      $('#payForm', root).onsubmit = (e) => {
        e.preventDefault();
        const amount = Math.min(left, round3($('#pAmount', root).value));
        if (!(amount > 0)) { toast('Please enter an amount above 0'); return; }
        const date = $('#pDate', root).value || todayStr();
        const payment = { id: uid(), amount, date };
        if ($('#pLog', root).checked) {
          const catId = owe ? 'debtpay' : 'debtin';
          const cat = state.categories.find((c) => c.id === catId) || catsOf(owe ? 'expense' : 'income')[0];
          const txId = uid();
          state.transactions.push({
            id: txId, type: owe ? 'expense' : 'income', amount, categoryId: cat.id, date,
            place: debt.person, method: $('#pMethod', root).value, note: `Debt ${owe ? 'payment' : 'repayment'}`, createdAt: Date.now(),
          });
          payment.txId = txId;
        }
        debt.payments.push(payment);
        save(); closeModal(); render();
        toast(debtLeft(debt) === 0 ? 'Debt fully settled!' : `${bhd(amount)} recorded`);
      };
    });
  }

  // ---------- Savings forms ----------
  function openAccountForm(existing = null) {
    const a = existing ? { ...existing } : { name: '', icon: '🐷', color: '#9d86d8', goal: '' };
    const icons = ['🐷', '🏦', '💰', '🏠', '🚗', '✈️', '🎓', '💍', '👶', '🕋', '🆘', '📈'];
    openModal(`
      <div class="modal-head"><h2>${existing ? 'Edit' : 'New'} savings account</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <form id="accForm" class="form-grid" autocomplete="off">
        <div class="field full"><label for="aName">Name</label><input class="input" id="aName" maxlength="40" required placeholder="e.g. Emergency fund, NBB Savings" value="${esc(a.name)}"></div>
        <div class="field full"><label>Icon</label><div class="swatches" style="gap:6px">${icons.map((i) => `<button type="button" class="btn btn-sm ${i === a.icon ? 'btn-primary' : ''}" data-aicon="${i}" style="font-size:18px;padding:4px 8px">${i}</button>`).join('')}</div></div>
        <div class="field full"><label>Colour</label><div class="swatches">${PALETTE.map((p) => `<button type="button" class="swatch ${p === a.color ? 'active' : ''}" data-color="${p}" style="--c:${p}" aria-label="${p}"></button>`).join('')}</div></div>
        <div class="field"><label for="aGoal">Goal (optional)</label><div class="amount-input"><span>BHD</span><input class="input" id="aGoal" type="number" min="0" step="0.001" inputmode="decimal" placeholder="0.000" value="${a.goal || ''}"></div></div>
        ${existing ? '' : `<div class="field"><label for="aOpen">Money already in it</label><div class="amount-input"><span>BHD</span><input class="input" id="aOpen" type="number" min="0" step="0.001" inputmode="decimal" placeholder="0.000"></div></div>`}
      </form>
      <div class="modal-foot"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" type="submit" form="accForm">Save</button></div>`, (root) => {
      $$('[data-aicon]', root).forEach((b) => b.onclick = () => { a.icon = b.dataset.aicon; $$('[data-aicon]', root).forEach((x) => x.classList.toggle('btn-primary', x === b)); });
      $$('[data-color]', root).forEach((b) => b.onclick = () => { a.color = b.dataset.color; $$('[data-color]', root).forEach((x) => x.classList.toggle('active', x === b)); });
      $('#accForm', root).onsubmit = (e) => {
        e.preventDefault();
        const name = $('#aName', root).value.trim();
        if (!name) return;
        const goal = Math.max(0, round3($('#aGoal', root).value));
        if (existing) {
          Object.assign(existing, { name, icon: a.icon, color: a.color, goal });
        } else {
          const opening = Math.max(0, round3($('#aOpen', root).value));
          state.savings.push({ id: uid(), name, icon: a.icon, color: a.color, goal, createdAt: Date.now(),
            entries: opening ? [{ id: uid(), amount: opening, date: todayStr(), note: 'Opening balance' }] : [] });
        }
        save(); closeModal(); render(); toast('Savings account saved');
      };
    });
  }

  function openEntryForm(acc, dir) {
    const into = dir === 'in';
    const bal = accountBalance(acc);
    openModal(`
      <div class="modal-head"><h2>${into ? `Add to ${esc(acc.name)}` : `Take from ${esc(acc.name)}`}</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <p class="card-sub" style="margin:0">Balance: <b>${bhd(bal)}</b></p>
      <form id="entryForm" class="form-grid" autocomplete="off">
        <div class="field full"><label for="eAmount">Amount</label><div class="amount-input"><span>BHD</span><input class="input" id="eAmount" type="number" min="0.001" ${into ? '' : `max="${bal}"`} step="0.001" inputmode="decimal" required placeholder="0.000"></div></div>
        <div class="field"><label for="eDate">Date</label><input class="input" id="eDate" type="date" required value="${todayStr()}"></div>
        <div class="field"><label for="eNote">Note (optional)</label><input class="input" id="eNote" maxlength="80" placeholder="${into ? 'e.g. Monthly saving' : 'e.g. Car repair'}"></div>
        <label class="full" style="display:flex;gap:10px;align-items:center;font-weight:600">
          <input type="checkbox" id="eLink" checked style="width:18px;height:18px;flex:none">
          ${into ? "Take it from this month's money (lowers this month's balance)" : "Add it to this month's money (raises this month's balance)"}
        </label>
      </form>
      <div class="modal-foot"><button class="btn" data-close>Cancel</button><button class="btn ${into ? 'btn-income' : 'btn-expense'}" type="submit" form="entryForm">Save</button></div>`, (root) => {
      setTimeout(() => $('#eAmount', root)?.focus(), 50);
      $('#entryForm', root).onsubmit = (e) => {
        e.preventDefault();
        let amount = round3($('#eAmount', root).value);
        if (!into) amount = Math.min(amount, bal);
        if (!(amount > 0)) { toast('Please enter an amount above 0'); return; }
        const date = $('#eDate', root).value || todayStr();
        const note = $('#eNote', root).value.trim();
        const entry = { id: uid(), amount: into ? amount : -amount, date, note };
        if ($('#eLink', root).checked) {
          const txId = uid();
          state.transactions.push({ id: txId, type: into ? 'expense' : 'income', amount, categoryId: into ? 'tosavings' : 'fromsavings', date,
            place: acc.name, method: 'Bank Transfer', note: note || (into ? 'Moved to savings' : 'Taken from savings'), createdAt: Date.now() });
          entry.txId = txId;
        }
        acc.entries.push(entry);
        save(); closeModal(); render();
        toast(into ? (acc.goal && accountBalance(acc) >= acc.goal && bal < acc.goal ? 'Goal reached!' : `${bhd(amount)} saved`) : `${bhd(amount)} taken out`);
      };
    });
  }

  // ---------- Future purchase forms ----------
  function openWishForm(existing = null) {
    const w = existing ? { ...existing } : { name: '', price: '', priority: 'medium', targetDate: '', categoryId: 'shopping', link: '', note: '', saved: '' };
    const cats = catsOf('expense');
    openModal(`
      <div class="modal-head"><h2>${existing ? 'Edit' : 'New'} future purchase</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <form id="wishForm" class="form-grid" autocomplete="off">
        <div class="field full"><label for="wName">What do you want to buy?</label><input class="input" id="wName" maxlength="60" required placeholder="e.g. iPhone, sofa, Umrah trip" value="${esc(w.name)}"></div>
        <div class="field"><label for="wPrice">Expected price</label><div class="amount-input"><span>BHD</span><input class="input" id="wPrice" type="number" min="0.001" step="0.001" inputmode="decimal" required placeholder="0.000" value="${w.price}"></div></div>
        <div class="field"><label for="wSaved">Already set aside</label><div class="amount-input"><span>BHD</span><input class="input" id="wSaved" type="number" min="0" step="0.001" inputmode="decimal" placeholder="0.000" value="${w.saved || ''}"></div></div>
        <div class="field full"><label>Priority</label>
          <div class="seg" id="wPri">${Object.entries(PRIORITIES).map(([k, [i, l]]) => `<button type="button" data-pri="${k}" class="${w.priority === k ? 'active' : ''}">${i} ${l}</button>`).join('')}</div>
        </div>
        <div class="field"><label for="wDate">Buy by (optional)</label><input class="input" id="wDate" type="date" value="${w.targetDate || ''}"></div>
        <div class="field"><label for="wCat">Category</label><select class="input" id="wCat">${cats.map((c) => `<option value="${c.id}" ${c.id === w.categoryId ? 'selected' : ''}>${esc(c.icon)} ${esc(c.name)}</option>`).join('')}</select></div>
        <div class="field full"><label for="wLink">Link (optional)</label><input class="input" id="wLink" type="url" maxlength="300" placeholder="https://…" value="${esc(w.link)}"></div>
        <div class="field full"><label for="wNote">Note (optional)</label><input class="input" id="wNote" maxlength="140" placeholder="Colour, size, shop…" value="${esc(w.note)}"></div>
      </form>
      <div class="modal-foot"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" type="submit" form="wishForm">Save</button></div>`, (root) => {
      $$('[data-pri]', root).forEach((b) => b.onclick = () => { w.priority = b.dataset.pri; $$('[data-pri]', root).forEach((x) => x.classList.toggle('active', x === b)); });
      $('#wishForm', root).onsubmit = (e) => {
        e.preventDefault();
        const price = round3($('#wPrice', root).value);
        const name = $('#wName', root).value.trim();
        if (!name || !(price > 0)) { toast('Please fill in the name and price'); return; }
        const rec = {
          id: existing?.id || uid(), name, price, priority: w.priority, targetDate: $('#wDate', root).value, categoryId: $('#wCat', root).value,
          link: $('#wLink', root).value.trim(), note: $('#wNote', root).value.trim(), saved: Math.max(0, round3($('#wSaved', root).value)),
          status: 'planned', createdAt: existing?.createdAt || Date.now(),
        };
        if (existing) state.wishlist = state.wishlist.map((x) => (x.id === rec.id ? rec : x));
        else state.wishlist.push(rec);
        save(); closeModal(); render(); toast('Purchase saved');
      };
    });
  }

  function openAsideForm(w) {
    openModal(`
      <div class="modal-head"><h2>Set aside for ${esc(w.name)}</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <p class="card-sub" style="margin:0">${bhd(w.saved || 0)} of ${bhd(w.price)} set aside so far.</p>
      <form id="asideForm" class="grid" style="gap:12px">
        <div class="field"><label for="sAmount">Amount to add</label><div class="amount-input"><span>BHD</span><input class="input" id="sAmount" type="number" min="0.001" step="0.001" inputmode="decimal" required value="${round3(Math.max(0, w.price - (w.saved || 0)))}"></div></div>
      </form>
      <div class="modal-foot"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" type="submit" form="asideForm">Save</button></div>`, (root) => {
      $('#asideForm', root).onsubmit = (e) => {
        e.preventDefault();
        const amt = round3($('#sAmount', root).value);
        if (!(amt > 0)) return;
        w.saved = round3((w.saved || 0) + amt);
        save(); closeModal(); render(); toast(w.saved >= w.price ? 'Fully saved up!' : `${bhd(amt)} set aside`);
      };
    });
  }

  function openBoughtForm(w) {
    openModal(`
      <div class="modal-head"><h2>Bought ${esc(w.name)}</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <form id="boughtForm" class="form-grid">
        <div class="field full"><label for="bPrice">Price you paid</label><div class="amount-input"><span>BHD</span><input class="input" id="bPrice" type="number" min="0.001" step="0.001" inputmode="decimal" required value="${w.price}"></div></div>
        <div class="field"><label for="bDate">Date</label><input class="input" id="bDate" type="date" required value="${todayStr()}"></div>
        <div class="field"><label for="bMethod">Payment method</label><select class="input" id="bMethod">${METHODS.map((m) => `<option>${m}</option>`).join('')}</select></div>
        <label class="full" style="display:flex;gap:10px;align-items:center;font-weight:600">
          <input type="checkbox" id="bLog" checked style="width:18px;height:18px;flex:none"> Record it as an expense (${esc(catById(w.categoryId).name)})
        </label>
      </form>
      <div class="modal-foot"><button class="btn" data-close>Cancel</button><button class="btn btn-income" type="submit" form="boughtForm">Mark as bought</button></div>`, (root) => {
      $('#boughtForm', root).onsubmit = (e) => {
        e.preventDefault();
        const price = round3($('#bPrice', root).value);
        if (!(price > 0)) return;
        const date = $('#bDate', root).value || todayStr();
        if ($('#bLog', root).checked) {
          state.transactions.push({ id: uid(), type: 'expense', amount: price, categoryId: w.categoryId || 'shopping', date,
            place: w.name, method: $('#bMethod', root).value, note: 'Planned purchase', createdAt: Date.now() });
        }
        Object.assign(w, { status: 'bought', boughtDate: date, boughtPrice: price });
        save(); closeModal(); render(); toast('Marked as bought');
      };
    });
  }

  // ---------- Adjust one budget month ----------
  function openPeriodForm(key) {
    const nominal = nominalStart(key);
    const manual = state.settings.cycleOverrides?.[key];
    const paid = cycleDay() > 1 && state.settings.salaryStart !== false ? salaryDateNear(key) : null;
    const auto = paid || nominal;
    openModal(`
      <div class="modal-head"><h2>Adjust this month</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <p style="margin:0;color:var(--muted)">Right now this month runs <b style="color:var(--text)">${esc(periodLabel(key))}</b>.
        ${manual ? 'You set this start date yourself.' : paid ? 'It starts on the day your salary was recorded.' : `It starts on day ${cycleDay()}, as set in Settings.`}</p>
      <form id="periodForm" class="grid" style="gap:12px">
        <div class="field"><label for="pStart">This month starts on</label>
          <input class="input" id="pStart" type="date" required value="${periodStart(key)}" min="${addDays(nominal, -OVERRIDE_WINDOW)}" max="${addDays(nominal, OVERRIDE_WINDOW)}">
        </div>
        <p class="card-sub" style="margin:0">The previous month will end the day before. Automatic start: ${fmtDate(auto)}.</p>
      </form>
      <div class="modal-foot">
        ${manual ? '<button class="btn" id="pAuto">Use automatic</button>' : '<button class="btn" data-close>Cancel</button>'}
        <button class="btn btn-primary" type="submit" form="periodForm">Save</button>
      </div>`, (root) => {
      const done = (msg) => { save(); closeModal(); ui.month = periodKeyOf(periodStart(key)); render(); toast(msg); };
      $('#pAuto', root)?.addEventListener('click', () => { delete state.settings.cycleOverrides[key]; done('Back to automatic'); });
      $('#periodForm', root).onsubmit = (e) => {
        e.preventDefault();
        const v = $('#pStart', root).value;
        if (!v) return;
        state.settings.cycleOverrides = state.settings.cycleOverrides || {};
        if (v === auto) delete state.settings.cycleOverrides[key];
        else state.settings.cycleOverrides[key] = v;
        done('Month start updated');
      };
    });
  }

  // ---------- Category form ----------
  // onDone(category | null) is used when the form is opened from inside another form.
  function openCatForm(type, existing = null, onDone = null) {
    const c = existing ? { ...existing } : { name: '', icon: type === 'income' ? '💰' : '🏷️', color: PALETTE[state.categories.length % PALETTE.length], type };
    const emojis = ['🍔', '☕', '🛒', '⛽', '🚕', '🛍️', '👕', '💡', '💧', '📶', '🏠', '💊', '🏋️', '🎬', '🎮', '📚', '✈️', '🎁', '👶', '🐱', '💇', '🚗', '🔧', '🕌', '❤️', '📱', '💳', '💼', '💻', '🎉', '💰', '📈', '🏷️', '📦'];
    openModal(`
      <div class="modal-head"><h2>${existing ? 'Edit' : 'New'} ${c.type} category</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <form id="catForm" class="grid" style="gap:14px">
        <div class="field"><label for="cName">Name</label><input class="input" id="cName" maxlength="30" required value="${esc(c.name)}" placeholder="e.g. Coffee"></div>
        <div class="field"><label for="cIcon">Emoji</label>
          <input class="input" id="cIcon" maxlength="4" value="${esc(c.icon)}" style="width:80px;font-size:20px;text-align:center">
          <div class="swatches" style="gap:4px">${emojis.map((e) => `<button type="button" class="btn btn-sm" data-emoji="${e}" style="padding:4px 6px;font-size:18px">${e}</button>`).join('')}</div>
        </div>
        <div class="field"><label>Colour</label>
          <div class="swatches">${PALETTE.map((p) => `<button type="button" class="swatch ${p === c.color ? 'active' : ''}" data-color="${p}" style="--c:${p}" aria-label="${p}"></button>`).join('')}</div>
        </div>
      </form>
      <div class="modal-foot"><button class="btn" ${onDone ? 'id="catBack"' : 'data-close'}>${onDone ? 'Back' : 'Cancel'}</button><button class="btn btn-primary" type="submit" form="catForm">Save</button></div>`, (root) => {
      if (onDone) $('#catBack', root).onclick = () => onDone(null);
      $$('[data-emoji]', root).forEach((b) => b.onclick = () => { $('#cIcon', root).value = b.dataset.emoji; });
      $$('[data-color]', root).forEach((b) => b.onclick = () => { c.color = b.dataset.color; $$('[data-color]', root).forEach((x) => x.classList.toggle('active', x === b)); });
      $('#catForm', root).onsubmit = (e) => {
        e.preventDefault();
        const name = $('#cName', root).value.trim();
        if (!name) return;
        const rec = { id: existing?.id || uid(), name, icon: $('#cIcon', root).value.trim() || '🏷️', color: c.color, type: c.type };
        if (existing) state.categories = state.categories.map((x) => (x.id === rec.id ? rec : x));
        else state.categories.push(rec);
        save(); render(); toast(`Category "${rec.name}" saved`);
        if (onDone) onDone(rec); else closeModal();
      };
    });
  }

  // ---------- Import / export ----------
  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function exportJson() { download(`budget-backup-${todayStr()}.json`, JSON.stringify(state, null, 2), 'application/json'); toast('Backup downloaded'); }
  function exportCsv() {
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['Date', 'Type', 'Category', 'Amount (BHD)', 'Place', 'Payment method', 'Note']];
    sortTx(state.transactions).forEach((t) => rows.push([t.date, t.type, catById(t.categoryId).name, t.amount.toFixed(3), t.place, t.method, t.note]));
    download(`budget-transactions-${todayStr()}.csv`, '﻿' + rows.map((r) => r.map(q).join(',')).join('\r\n'), 'text/csv');
    toast('CSV downloaded');
  }
  function importJson(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || !Array.isArray(data.transactions)) throw new Error('bad file');
        confirmBox('Restoring will replace all current data with the backup.', () => {
          state = normalize(data); save(); applyTheme(); render(); toast('Backup restored');
        }, 'Restore');
      } catch { toast('That file is not a valid backup'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function loadDemo() {
    const s = freshState();
    s.categories = state.categories;
    const now = new Date();
    const places = {
      food: ['Talabat', 'Saffron', 'Haji\'s Cafe', 'McDonald\'s Seef', 'Café Lilou'],
      groceries: ['Lulu Hypermarket', 'Al Jazira Supermarket', 'Carrefour City Centre'],
      transport: ['Bapco Station', 'Careem', 'Parking Seef Mall'],
      shopping: ['City Centre Bahrain', 'Amazon', 'The Avenues'],
      bills: ['EWA', 'Batelco', 'STC Bahrain'],
      fun: ['Cineco', 'Wahooo! Waterpark', 'Steam'],
      health: ['Nasser Pharmacy', 'Royal Bahrain Hospital'],
      subs: ['Netflix', 'Spotify', 'iCloud'],
    };
    const ranges = { food: [1.5, 9], groceries: [6, 35], transport: [3, 12], shopping: [8, 60], bills: [12, 45], fun: [4, 20], health: [2, 25], subs: [1.5, 5] };
    const methods = ['Cash', 'Debit Card', 'Credit Card', 'BenefitPay', 'Apple Pay'];
    const rand = (a, b) => round3(a + Math.random() * (b - a));
    for (let m = 5; m >= 0; m--) {
      const base = new Date(now.getFullYear(), now.getMonth() - m, 1);
      const key = monthKey(base);
      const lastDay = m === 0 ? now.getDate() : daysInMonth(key);
      const d = (day) => `${key}-${pad(Math.min(day, lastDay))}`;
      s.transactions.push({ id: uid(), type: 'income', amount: 950, categoryId: 'salary', date: d(1), place: 'Employer', method: 'Bank Transfer', note: 'Monthly salary', createdAt: Date.now() });
      if (m % 2 === 0) s.transactions.push({ id: uid(), type: 'income', amount: rand(60, 180), categoryId: 'freelance', date: d(15), place: 'Client', method: 'BenefitPay', note: '', createdAt: Date.now() });
      s.transactions.push({ id: uid(), type: 'expense', amount: 280, categoryId: 'housing', date: d(2), place: 'Landlord', method: 'Bank Transfer', note: 'Rent', createdAt: Date.now() });
      const count = Math.round(lastDay * 0.9);
      for (let i = 0; i < count; i++) {
        const cat = Object.keys(places)[Math.floor(Math.random() * 8)];
        const list = places[cat];
        s.transactions.push({
          id: uid(), type: 'expense', amount: rand(...ranges[cat]), categoryId: cat, date: d(1 + Math.floor(Math.random() * lastDay)),
          place: list[Math.floor(Math.random() * list.length)], method: methods[Math.floor(Math.random() * methods.length)], note: '', createdAt: Date.now() + i,
        });
      }
    }
    s.budgets = { overall: 750, byCategory: { food: 90, groceries: 120, transport: 60, shopping: 80, bills: 70, fun: 40, housing: 280 } };
    const due = (days) => { const x = new Date(); x.setDate(x.getDate() + days); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
    s.debts = [
      { id: uid(), direction: 'owe', person: 'NBB Car Loan', amount: 3500, dueDate: due(240), note: 'Monthly instalments', createdAt: Date.now(), payments: [{ id: uid(), amount: 875, date: due(-60) }, { id: uid(), amount: 175, date: due(-30) }] },
      { id: uid(), direction: 'owe', person: 'Ahmed', amount: 50, dueDate: due(-3), note: 'Dinner split', createdAt: Date.now(), payments: [] },
      { id: uid(), direction: 'owed', person: 'Sara', amount: 120, dueDate: due(14), note: 'Concert tickets', createdAt: Date.now(), payments: [{ id: uid(), amount: 40, date: due(-5) }] },
    ];
    s.savings = [
      { id: uid(), name: 'Emergency fund', icon: '🆘', color: '#9d86d8', goal: 3000, createdAt: Date.now(), entries: [{ id: uid(), amount: 1200, date: due(-150), note: 'Opening balance' }, { id: uid(), amount: 150, date: due(-30), note: 'Monthly saving' }] },
      { id: uid(), name: 'Travel', icon: '✈️', color: '#4fb0c6', goal: 800, createdAt: Date.now(), entries: [{ id: uid(), amount: 320, date: due(-60), note: 'Opening balance' }] },
    ];
    s.wishlist = [
      { id: uid(), name: 'New laptop', price: 450, priority: 'high', targetDate: due(40), categoryId: 'shopping', link: '', note: '', saved: 200, status: 'planned', createdAt: Date.now() },
      { id: uid(), name: 'Gym membership', price: 120, priority: 'medium', targetDate: due(25), categoryId: 'health', link: '', note: '6 months', saved: 0, status: 'planned', createdAt: Date.now() },
      { id: uid(), name: 'PS5', price: 210, priority: 'low', targetDate: '', categoryId: 'fun', link: '', note: '', saved: 0, status: 'planned', createdAt: Date.now() },
    ];
    s.settings = state.settings;
    state = s; save(); render(); toast('Demo data loaded');
  }

  // ---------- Global events ----------
  document.addEventListener('click', (e) => {
    const nav = e.target.closest('.nav-item');
    if (nav) { ui.view = nav.dataset.view; render(); window.scrollTo({ top: 0 }); return; }
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const { action, id } = el.dataset;
    switch (action) {
      case 'add-expense': openTxForm('expense'); break;
      case 'add-income': openTxForm('income'); break;
      case 'goto': ui.view = el.dataset.view; render(); window.scrollTo({ top: 0 }); break;
      case 'edit-tx': {
        const t = state.transactions.find((x) => x.id === id);
        if (t && isTransfer(t)) { toast('Savings moves are edited in Savings'); if (showSavings()) { ui.view = 'savings'; render(); } break; }
        if (t) openTxForm(t.type, t);
        break;
      }
      case 'del-tx': confirmBox('This transaction will be permanently deleted.', () => {
        state.transactions = state.transactions.filter((x) => x.id !== id);
        state.debts.forEach((d) => d.payments.forEach((p) => { if (p.txId === id) delete p.txId; }));
        state.savings.forEach((a) => { a.entries = a.entries.filter((e) => e.txId !== id); });
        save(); render(); toast('Deleted');
      }); break;
      case 'add-debt': openDebtForm(); break;
      case 'edit-debt': { const d = state.debts.find((x) => x.id === id); if (d) openDebtForm(d); break; }
      case 'pay-debt': { const d = state.debts.find((x) => x.id === id); if (d) openPaymentForm(d); break; }
      case 'del-debt': confirmBox('This debt and its payment history will be deleted. Transactions already recorded stay.', () => {
        state.debts = state.debts.filter((x) => x.id !== id); save(); render(); toast('Debt deleted');
      }); break;
      case 'del-payment': {
        const d = state.debts.find((x) => x.id === id);
        const p = d?.payments.find((x) => x.id === el.dataset.pid);
        if (!p) break;
        confirmBox(`Remove the ${bhd(p.amount)} payment${p.txId ? ' and its linked transaction' : ''}?`, () => {
          d.payments = d.payments.filter((x) => x !== p);
          if (p.txId) state.transactions = state.transactions.filter((t) => t.id !== p.txId);
          save(); render(); toast('Payment removed');
        }, 'Remove');
        break;
      }
      case 'add-cat': openCatForm(el.dataset.type); break;
      case 'mask-savings':
        ui.maskSavings = !ui.maskSavings;
        try { localStorage.setItem(MASK_KEY, ui.maskSavings ? '1' : '0'); } catch { /* storage blocked */ }
        render(); break;
      case 'add-account': openAccountForm(); break;
      case 'edit-account': { const a = state.savings.find((x) => x.id === id); if (a) openAccountForm(a); break; }
      case 'save-in': case 'save-out': { const a = state.savings.find((x) => x.id === id); if (a) openEntryForm(a, action === 'save-in' ? 'in' : 'out'); break; }
      case 'del-account': {
        const a = state.savings.find((x) => x.id === id);
        if (!a) break;
        confirmBox(`Delete "${a.name}" and its history? Transactions already recorded stay.`, () => {
          state.savings = state.savings.filter((x) => x !== a); save(); render(); toast('Account deleted');
        });
        break;
      }
      case 'del-entry': {
        const a = state.savings.find((x) => x.id === id);
        const en = a?.entries.find((x) => x.id === el.dataset.eid);
        if (!en) break;
        confirmBox(`Remove this ${bhd(Math.abs(en.amount))} entry${en.txId ? ' and its linked transaction' : ''}?`, () => {
          a.entries = a.entries.filter((x) => x !== en);
          if (en.txId) state.transactions = state.transactions.filter((t) => t.id !== en.txId);
          save(); render(); toast('Entry removed');
        }, 'Remove');
        break;
      }
      case 'add-wish': openWishForm(); break;
      case 'edit-wish': { const w = state.wishlist.find((x) => x.id === id); if (w) openWishForm(w); break; }
      case 'wish-aside': { const w = state.wishlist.find((x) => x.id === id); if (w) openAsideForm(w); break; }
      case 'wish-bought': { const w = state.wishlist.find((x) => x.id === id); if (w) openBoughtForm(w); break; }
      case 'del-wish': confirmBox('Remove this item from your future purchases?', () => {
        state.wishlist = state.wishlist.filter((x) => x.id !== id); save(); render(); toast('Removed');
      }, 'Remove'); break;
      case 'plan-shift': ui.planOffset = Math.max(0, Math.min(6, ui.planOffset + Number(el.dataset.d))); render(); break;
      case 'plan-income-prev': planFor(planKey()).income = sum(incomeIn(shiftMonth(planKey(), -1)), (t) => t.amount); save(); render(); break;
      case 'plan-fill': {
        const plan = planFor(planKey());
        if (el.dataset.src === 'budgets') plan.byCategory = { ...state.budgets.byCategory };
        else plan.byCategory = Object.fromEntries(spendByCategory(shiftMonth(planKey(), -1)).map((r) => [r.cat.id, r.total]));
        save(); render(); toast('Plan filled in, adjust as you like');
        break;
      }
      case 'plan-clear': confirmBox('Clear everything in this month\'s plan?', () => { delete state.plans[planKey()]; save(); render(); }, 'Clear'); break;
      case 'plan-apply': {
        const plan = planFor(planKey());
        const total = sum(Object.values(plan.byCategory));
        confirmBox(`Your category budgets will be replaced by this plan, and the monthly budget set to ${bhd(total)}.`, () => {
          state.budgets.byCategory = { ...plan.byCategory };
          state.budgets.overall = total;
          save(); render(); toast('Budgets updated from your plan');
        }, 'Use plan');
        break;
      }
      case 'edit-cat': { const c = state.categories.find((x) => x.id === id); if (c) openCatForm(c.type, c); break; }
      case 'del-cat': {
        const c = state.categories.find((x) => x.id === id);
        if (!c) break;
        const same = catsOf(c.type);
        if (same.length <= 1) { toast('You need at least one category of each type'); break; }
        const fallback = same.find((x) => x.id === (c.type === 'income' ? 'otherin' : 'other') && x.id !== c.id) || same.find((x) => x.id !== c.id);
        const used = state.transactions.filter((t) => t.categoryId === c.id).length;
        confirmBox(`Delete "${c.name}"?${used ? ` Its ${used} transaction(s) will move to "${fallback.name}".` : ''}`, () => {
          state.transactions.forEach((t) => { if (t.categoryId === c.id) t.categoryId = fallback.id; });
          state.categories = state.categories.filter((x) => x.id !== c.id);
          delete state.budgets.byCategory[c.id];
          save(); render(); toast('Category deleted');
        });
        break;
      }
      case 'sync-signin': window.BudgetSync?.signIn(); break;
      case 'sync-signout': openModal(`
        <div class="modal-head"><h2>Sign out?</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
        <p style="margin:0;color:var(--muted)">Your data stays safe in your account. Choose whether to keep a copy on this device.</p>
        <div class="modal-foot">
          <button class="btn btn-danger" id="soRemove">Sign out & remove from this device</button>
          <button class="btn btn-primary" id="soKeep">Sign out & keep copy</button>
        </div>`, (root) => {
        $('#soKeep', root).onclick = () => { closeModal(); window.BudgetSync?.signOut(false); toast('Signed out'); };
        $('#soRemove', root).onclick = () => { closeModal(); window.BudgetSync?.signOut(true); toast('Signed out and cleared this device'); };
      }); break;
      case 'export-json': exportJson(); break;
      case 'export-csv': exportCsv(); break;
      case 'import-json': $('#importFile').click(); break;
      case 'demo': confirmBox('Demo data will replace your current transactions, budgets and debts.', loadDemo, 'Load demo'); break;
      case 'reset': confirmBox('Everything (transactions, budgets, debts, categories) will be erased. Download a backup first if you need it.', () => {
        state = freshState(); save(); applyTheme(); render(); toast('All data erased');
      }, 'Erase everything'); break;
    }
  });

  $('#prevMonth').onclick = () => { ui.month = shiftMonth(ui.month, -1); render(); };
  $('#nextMonth').onclick = () => { ui.month = shiftMonth(ui.month, 1); render(); };
  $('#monthLabel').onclick = () => { ui.month = currentPeriod(); render(); };
  $('#editPeriod').onclick = () => openPeriodForm(ui.month);

  // Keep in sync if the app is open in two tabs
  window.addEventListener('storage', (e) => { if (e.key === STORAGE_KEY) { state = loadState(); applyTheme(); render(); } });

  // Hooks used by sync.js
  window.BudgetApp = {
    getState: () => state,
    replaceState(next) { state = normalize(next); save({ sync: false }); applyTheme(); render(); },
    resetLocal() { state = freshState(); save({ sync: false }); applyTheme(); render(); },
    onSyncChange() { renderSyncBadge(); if (ui.view === 'settings' && !modal.open) render(); },
    toast,
  };
  setTimeout(() => { if (!window.BudgetSync) { syncUnavailable = true; renderSyncBadge(); if (ui.view === 'settings') render(); } }, 10000);

  applyTheme();
  render();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
