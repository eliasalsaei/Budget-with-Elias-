/* Budget with Elias — all app logic. Data lives in localStorage on this device. */
(() => {
  'use strict';

  const STORAGE_KEY = 'budgetWithElias.v1';
  const METHODS = ['Cash', 'Debit Card', 'Credit Card', 'BenefitPay', 'Bank Transfer', 'Apple Pay', 'Other'];
  const PALETTE = ['#f43f5e', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
    '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#64748b', '#78716c'];

  const DEFAULT_CATEGORIES = [
    ['food', 'Food & Dining', '🍔', '#f97316', 'expense'],
    ['groceries', 'Groceries', '🛒', '#84cc16', 'expense'],
    ['transport', 'Transport & Fuel', '⛽', '#0ea5e9', 'expense'],
    ['shopping', 'Shopping', '🛍️', '#ec4899', 'expense'],
    ['bills', 'Bills & Utilities', '💡', '#f59e0b', 'expense'],
    ['housing', 'Rent & Housing', '🏠', '#8b5cf6', 'expense'],
    ['health', 'Health', '💊', '#10b981', 'expense'],
    ['fun', 'Entertainment', '🎬', '#d946ef', 'expense'],
    ['education', 'Education', '📚', '#6366f1', 'expense'],
    ['travel', 'Travel', '✈️', '#06b6d4', 'expense'],
    ['family', 'Family & Gifts', '🎁', '#f43f5e', 'expense'],
    ['subs', 'Subscriptions', '📱', '#3b82f6', 'expense'],
    ['debtpay', 'Debt Payment', '💳', '#ef4444', 'expense'],
    ['other', 'Other', '📦', '#64748b', 'expense'],
    ['salary', 'Salary', '💼', '#10b981', 'income'],
    ['freelance', 'Freelance', '💻', '#14b8a6', 'income'],
    ['giftin', 'Gifts Received', '🎉', '#a855f7', 'income'],
    ['debtin', 'Debt Repaid to Me', '🤝', '#06b6d4', 'income'],
    ['otherin', 'Other Income', '💰', '#84cc16', 'income'],
  ].map(([id, name, icon, color, type]) => ({ id, name, icon, color, type }));

  const VIEW_TITLES = {
    dashboard: 'Dashboard', transactions: 'Transactions', budgets: 'Budgets',
    debts: 'Debts', insights: 'Insights', settings: 'Settings',
  };

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
      categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
      transactions: [],
      budgets: { overall: 0, byCategory: {} },
      debts: [],
      // cycleDay: the day each budget month starts (salary day). salaryStart: start on the actual
      // salary date when it lands within a few days of cycleDay. cycleOverrides: { 'YYYY-MM': 'YYYY-MM-DD' }.
      settings: { theme: 'auto', cycleDay: 25, salaryStart: true, cycleOverrides: {} },
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
    return {
      version: 1,
      categories: Array.isArray(s.categories) && s.categories.length ? s.categories : base.categories,
      transactions: Array.isArray(s.transactions) ? s.transactions : [],
      budgets: { overall: Number(s.budgets?.overall) || 0, byCategory: { ...(s.budgets?.byCategory || {}) } },
      debts: Array.isArray(s.debts) ? s.debts.map((d) => ({ payments: [], ...d })) : [],
      settings: { ...base.settings, ...(s.settings || {}) },
    };
  }

  let state = loadState();
  let saveFailed = false;
  function save({ sync = true } = {}) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      saveFailed = false;
    } catch (e) {
      if (!saveFailed) toast('⚠️ Could not save — browser storage is unavailable');
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
    debtTab: 'owe',
  };

  const catById = (id) => state.categories.find((c) => c.id === id) || { id, name: 'Uncategorised', icon: '❔', color: '#94a3b8', type: 'expense' };
  const catsOf = (type) => state.categories.filter((c) => c.type === type);
  const txInMonth = (key = ui.month) => {
    const start = periodStart(key), end = periodEnd(key);
    return state.transactions.filter((t) => t.date && t.date >= start && t.date <= end);
  };
  const expensesIn = (key) => txInMonth(key).filter((t) => t.type === 'expense');
  const incomeIn = (key) => txInMonth(key).filter((t) => t.type === 'income');
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
          <div class="tx-amt ${t.type}">${t.type === 'expense' ? '−' : '+'}${bhd(t.amount)}</div>
          ${actions ? `<div class="tx-actions">
            <button data-action="edit-tx" data-id="${t.id}" title="Edit">✏️</button>
            <button data-action="del-tx" data-id="${t.id}" title="Delete">🗑️</button>
          </div>` : ''}
        </div>
      </div>`;
  }

  const empty = (emoji, text, btn = '') => `<div class="empty"><span class="big">${emoji}</span>${text}${btn ? `<div style="margin-top:12px">${btn}</div>` : ''}</div>`;

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
    if (rest.length) legendRows.push({ name: `➕ ${rest.length} more`, color: '#94a3b8', total: sum(rest, (r) => r.total) });
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
    const balance = round3(earned - spent);
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
        ? `<div class="alert red">🚨 You are over your monthly budget by ${bhd(spent - overall)}.</div>`
        : `<div class="alert amber">⚠️ You have used ${Math.round((spent / overall) * 100)}% of your monthly budget.</div>`);
    }
    for (const r of byCat) {
      const lim = Number(state.budgets.byCategory[r.cat.id]) || 0;
      if (!lim) continue;
      if (r.total > lim) alerts.push(`<div class="alert red">${esc(r.cat.icon)} ${esc(r.cat.name)} is over budget by ${bhd(r.total - lim)} (${bhd(r.total)} of ${bhd(lim)}).</div>`);
      else if (r.total === lim) alerts.push(`<div class="alert amber">${esc(r.cat.icon)} ${esc(r.cat.name)} has used its full budget of ${bhd(lim)}.</div>`);
      else if (r.total >= lim * 0.8) alerts.push(`<div class="alert amber">${esc(r.cat.icon)} ${esc(r.cat.name)} is at ${Math.round((r.total / lim) * 100)}% of its budget.</div>`);
    }
    const overdue = state.debts.filter((d) => debtLeft(d) > 0 && d.dueDate && d.dueDate < todayStr());
    overdue.forEach((d) => alerts.push(`<div class="alert red">⏰ ${d.direction === 'owe' ? 'You owe' : 'Owed by'} ${esc(d.person)}: ${bhd(debtLeft(d))} was due ${fmtDate(d.dueDate)}.</div>`));

    const recent = sortTx(txInMonth()).slice(0, 6);
    const budgetLeft = overall > 0 ? round3(overall - spent) : null;

    return `
      <div class="grid grid-4">
        <div class="stat hero"><div class="stat-label">💜 Balance this month</div><div class="stat-value">${bhd(balance)}</div><div class="stat-foot">${balance >= 0 ? 'Income minus spending' : 'You spent more than you earned'}</div></div>
        <div class="stat income"><div class="stat-label">⬆️ Income</div><div class="stat-value">${bhd(earned)}</div><div class="stat-foot">${inc.length} record${inc.length === 1 ? '' : 's'}</div></div>
        <div class="stat expense"><div class="stat-label">⬇️ Spending</div><div class="stat-value">${bhd(spent)}</div><div class="stat-foot">${exp.length} expense${exp.length === 1 ? '' : 's'}</div></div>
        <div class="stat budget"><div class="stat-label">🎯 Budget left</div><div class="stat-value">${budgetLeft === null ? '—' : bhd(budgetLeft)}</div><div class="stat-foot">${overall > 0 ? `of ${bhd(overall)}` : '<u data-action="goto" data-view="budgets" style="cursor:pointer">Set a monthly budget</u>'}</div></div>
      </div>

      ${alerts.length ? `<div class="card"><div class="card-head"><h3 class="card-title">🔔 Heads up</h3></div><div class="grid" style="gap:8px">${alerts.join('')}</div></div>` : ''}

      <div class="grid grid-2">
        <div class="card">
          <div class="card-head"><h3 class="card-title">🍩 Where your money went</h3><button class="link-btn" data-action="goto" data-view="insights">Details →</button></div>
          ${donut(byCat, spent, 'Spent')}
        </div>
        <div class="card">
          <div class="card-head"><h3 class="card-title">📅 Daily spending</h3><span class="card-sub">${periodLabel(ui.month)}</span></div>
          ${spent > 0 ? barChart(dayLabels, [{ label: 'Spent', values: daily, color: '#ec4899' }], { labelEvery: days > 20 ? 5 : 1 }) : empty('📅', 'Daily bars will appear once you add expenses.')}
        </div>
      </div>

      <div class="grid grid-2">
        <div class="card">
          <div class="card-head"><h3 class="card-title">🧾 Recent transactions</h3><button class="link-btn" data-action="goto" data-view="transactions">See all →</button></div>
          ${recent.length ? `<div class="tx-list">${recent.map((t) => txRow(t)).join('')}</div>`
            : empty('🧾', 'Nothing recorded for this month.', '<button class="btn btn-primary" data-action="add-expense">Add your first expense</button>')}
        </div>
        <div class="card">
          <div class="card-head"><h3 class="card-title">🤝 Debts snapshot</h3><button class="link-btn" data-action="goto" data-view="debts">Manage →</button></div>
          <div class="grid grid-2" style="gap:10px">
            <div class="stat debt" style="padding:14px"><div class="stat-label">I owe</div><div class="stat-value" style="font-size:19px">${bhd(iOwe)}</div></div>
            <div class="stat income" style="padding:14px"><div class="stat-label">Owed to me</div><div class="stat-value" style="font-size:19px">${bhd(owedMe)}</div></div>
          </div>
          <div class="kv" style="margin-top:14px">
            ${state.debts.filter((d) => debtLeft(d) > 0).sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999')).slice(0, 4).map((d) => `
              <div class="kv-row"><span>${d.direction === 'owe' ? '🔴' : '🟢'} ${esc(d.person)}${d.dueDate ? ` · due ${fmtDate(d.dueDate, { day: 'numeric', month: 'short' })}` : ''}</span><b>${bhd(debtLeft(d))}</b></div>`).join('') || '<div class="card-sub">No open debts 🎉</div>'}
          </div>
        </div>
      </div>`;
  }

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
          <input class="input" id="txSearch" type="search" placeholder="🔎 Search place, note, amount…" value="${esc(f.q)}">
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
            <button class="btn btn-sm btn-expense" data-action="add-expense">➖ Expense</button>
            <button class="btn btn-sm btn-income" data-action="add-income">➕ Income</button>
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
          <div class="card-head"><h3 class="card-title">🎯 Overall monthly budget</h3></div>
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
          <div class="card-head"><h3 class="card-title">📐 Planning</h3></div>
          <div class="kv">
            <div class="kv-row"><span>Category limits total</span><b>${bhd(totalCatLimits)}</b></div>
            <div class="kv-row"><span>Overall budget</span><b>${overall ? bhd(overall) : '—'}</b></div>
            <div class="kv-row"><span>Unassigned</span><b>${overall ? bhd(overall - totalCatLimits) : '—'}</b></div>
          </div>
          <p class="card-sub" style="margin-bottom:0">Tip: give each category a limit. Leave it empty if you don't want to track one.</p>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3 class="card-title">🗂️ Category budgets — ${periodLabel(ui.month)}</h3><button class="btn btn-sm btn-expense" data-action="add-cat" data-type="expense">＋ New category</button></div>
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
        <div class="stat debt"><div class="stat-label">🔴 I owe (remaining)</div><div class="stat-value">${bhd(sum(owe, debtLeft))}</div><div class="stat-foot">${owe.filter((d) => debtLeft(d) > 0).length} open</div></div>
        <div class="stat income"><div class="stat-label">🟢 Owed to me (remaining)</div><div class="stat-value">${bhd(sum(owed, debtLeft))}</div><div class="stat-foot">${owed.filter((d) => debtLeft(d) > 0).length} open</div></div>
        <div class="stat hero"><div class="stat-label">⚖️ Net position</div><div class="stat-value">${bhd(sum(owed, debtLeft) - sum(owe, debtLeft))}</div><div class="stat-foot">Owed to me minus what I owe</div></div>
      </div>
      <div class="card">
        <div class="card-head">
          <div class="seg" id="debtTab">
            <button data-tab="owe" class="${tab === 'owe' ? 'active is-expense' : ''}">I owe</button>
            <button data-tab="owed" class="${tab === 'owed' ? 'active is-income' : ''}">Owed to me</button>
          </div>
          <button class="btn btn-primary btn-sm" data-action="add-debt">＋ New debt</button>
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
                      <div class="card-sub">${left === 0 ? '<span class="pill green">✓ Settled</span>' : overdue ? `<span class="pill red">Overdue · ${fmtDate(d.dueDate)}</span>` : d.dueDate ? `Due ${fmtDate(d.dueDate)}` : 'No due date'}</div>
                    </div>
                  </div>
                  <div class="debt-amt"><b style="color:${d.direction === 'owe' ? 'var(--expense)' : 'var(--income)'}">${bhd(left)}</b><small>of ${bhd(d.amount)}</small></div>
                </div>
                ${d.note ? `<div class="card-sub">📝 ${esc(d.note)}</div>` : ''}
                <div class="bar" style="--c:${d.direction === 'owe' ? 'var(--warn)' : 'var(--income)'}"><i style="width:${Math.min(100, pct)}%"></i></div>
                <div class="card-sub">${bhd(paid)} ${d.direction === 'owe' ? 'paid back' : 'received'} · ${Math.round(pct)}%</div>
                <div class="btn-row">
                  ${left > 0 ? `<button class="btn btn-sm ${d.direction === 'owe' ? 'btn-expense' : 'btn-income'}" data-action="pay-debt" data-id="${d.id}">${d.direction === 'owe' ? '💸 Record payment' : '💰 Record received'}</button>` : ''}
                  <button class="btn btn-sm" data-action="edit-debt" data-id="${d.id}">✏️ Edit</button>
                  <button class="btn btn-sm btn-danger" data-action="del-debt" data-id="${d.id}">🗑️</button>
                </div>
                ${d.payments.length ? `<details class="history"><summary>Payment history (${d.payments.length})</summary><ul>
                  ${d.payments.slice().sort((a, b) => b.date.localeCompare(a.date)).map((p) => `<li><span>${fmtDate(p.date)}</span><span><b>${bhd(p.amount)}</b> <button class="link-btn" data-action="del-payment" data-id="${d.id}" data-pid="${p.id}" title="Remove payment">✕</button></span></li>`).join('')}
                </ul></details>` : ''}
              </div>`;
          }).join('') : `<div class="span-2">${empty(tab === 'owe' ? '🙌' : '📭', tab === 'owe' ? "You don't owe anyone. Nice!" : 'Nobody owes you money right now.', '<button class="btn btn-primary" data-action="add-debt">＋ Add a debt</button>')}</div>`}
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
      .map(([name, v], i) => ({ name: `${name} (${v.count}×)`, total: v.total, color: PALETTE[(i * 3) % PALETTE.length], icon: '📍' }));
    const methodIcons = { Cash: '💵', 'Debit Card': '💳', 'Credit Card': '💳', BenefitPay: '📲', 'Bank Transfer': '🏦', 'Apple Pay': '📱', Other: '🔹' };
    const methods = groupBy((t) => t.method || 'Other')
      .map(([name, v], i) => ({ name, total: v.total, color: PALETTE[(i * 4 + 8) % PALETTE.length], icon: methodIcons[name] || '🔹' }));

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
        <div class="stat expense"><div class="stat-label">📆 Daily average</div><div class="stat-value">${bhd(spent / daysCounted)}</div><div class="stat-foot">over ${daysCounted} day${daysCounted === 1 ? '' : 's'}</div></div>
        <div class="stat budget"><div class="stat-label">📈 vs last month</div><div class="stat-value">${change === null ? '—' : `${change > 0 ? '▲' : '▼'} ${Math.abs(Math.round(change))}%`}</div><div class="stat-foot">Last month: ${bhd(prevSpent)}</div></div>
        <div class="stat hero"><div class="stat-label">🏆 Top category</div><div class="stat-value" style="font-size:19px">${topCat ? `${esc(topCat.cat.icon)} ${esc(topCat.cat.name)}` : '—'}</div><div class="stat-foot">${topCat ? bhd(topCat.total) : 'No spending yet'}</div></div>
        <div class="stat debt"><div class="stat-label">💥 Biggest expense</div><div class="stat-value">${biggest ? bhd(biggest.amount) : '—'}</div><div class="stat-foot">${biggest ? esc(biggest.place || catById(biggest.categoryId).name) + ' · ' + fmtDate(biggest.date, { day: 'numeric', month: 'short' }) : '—'}</div></div>
      </div>

      <div class="grid grid-2">
        <div class="card">
          <div class="card-head"><h3 class="card-title">🗂️ Spending by category</h3><span class="card-sub">${bhd(spent)}</span></div>
          ${rankList(byCat.map((r) => ({ name: r.cat.name, icon: r.cat.icon, total: r.total, color: r.cat.color })), spent, 'No spending this month.')}
        </div>
        <div class="card">
          <div class="card-head"><h3 class="card-title">📍 Where you spend most</h3><span class="card-sub">Top places</span></div>
          ${rankList(places, spent, 'Add a place to your expenses to see where your money goes.')}
        </div>
      </div>

      <div class="grid grid-2">
        <div class="card">
          <div class="card-head"><h3 class="card-title">📊 Income vs spending — last 6 budget months</h3></div>
          ${barChart(months.map((k) => periodLabel(k, true)), [
            { label: 'Income', values: trendInc, color: '#10b981' },
            { label: 'Spending', values: trendExp, color: '#f43f5e' },
          ], { height: 200 })}
          <div class="chart-legend"><span><i style="background:#10b981"></i>Income</span><span><i style="background:#f43f5e"></i>Spending</span></div>
        </div>
        <div class="card">
          <div class="card-head"><h3 class="card-title">💳 Payment methods</h3></div>
          ${rankList(methods, spent, 'No spending this month.')}
          <div class="card-head" style="margin-top:18px"><h3 class="card-title">🗓️ By day of week</h3></div>
          ${spent ? barChart(wdLabels, [{ label: 'Spent', values: wd, color: '#8b5cf6' }], { height: 150 }) : empty('🗓️', 'No data yet.')}
        </div>
      </div>`;
  }

  function renderSettings() {
    const themeBtn = (v, label) => `<button data-theme-set="${v}" class="${state.settings.theme === v ? 'active' : ''}">${label}</button>`;
    const catItem = (c) => `
      <div class="cat-item">
        <span class="emoji" style="background:color-mix(in srgb, ${c.color} 18%, transparent)">${esc(c.icon)}</span>
        <span class="name">${esc(c.name)}</span>
        <button class="link-btn" data-action="edit-cat" data-id="${c.id}" title="Edit">✏️</button>
        <button class="link-btn" data-action="del-cat" data-id="${c.id}" title="Delete">🗑️</button>
      </div>`;
    const cur = currentPeriod();
    const startWhy = state.settings.cycleOverrides?.[cur] ? 'set by you'
      : (cycleDay() > 1 && state.settings.salaryStart !== false && salaryDateNear(cur)) ? 'started on your salary day' : `day ${cycleDay()}`;
    return `
      ${syncCard()}
      <div class="card">
        <div class="card-head"><h3 class="card-title">📅 Budget month</h3><span class="pill">Now: ${esc(periodLabel(cur))}</span></div>
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
        <p class="card-sub" style="margin-bottom:0">Current month: <b>${esc(periodLabel(cur))}</b> (${startWhy}). You can also change any single month with the ✏️ button next to the month at the top.</p>
      </div>
      <div class="card">
        <div class="card-head"><h3 class="card-title">🗂️ Expense categories</h3><button class="btn btn-sm btn-expense" data-action="add-cat" data-type="expense">＋ Add</button></div>
        <div class="cat-manage">${catsOf('expense').map(catItem).join('')}</div>
      </div>
      <div class="card">
        <div class="card-head"><h3 class="card-title">💰 Income categories</h3><button class="btn btn-sm btn-income" data-action="add-cat" data-type="income">＋ Add</button></div>
        <div class="cat-manage">${catsOf('income').map(catItem).join('')}</div>
      </div>
      <div class="grid grid-2">
        <div class="card">
          <div class="card-head"><h3 class="card-title">🎨 Appearance</h3></div>
          <div class="seg">${themeBtn('auto', '🌗 Auto')}${themeBtn('light', '☀️ Light')}${themeBtn('dark', '🌙 Dark')}</div>
        </div>
        <div class="card">
          <div class="card-head"><h3 class="card-title">💾 Backup & data</h3></div>
          <p class="card-sub" style="margin-top:0">${syncInfo().user ? 'Your data is synced to your account. A backup file is still handy for safekeeping.' : 'Without sign-in, your data is saved only in this browser. Download a backup regularly so you never lose it.'}</p>
          <div class="btn-row">
            <button class="btn btn-primary btn-sm" data-action="export-json">⬇️ Backup (JSON)</button>
            <button class="btn btn-sm" data-action="import-json">⬆️ Restore backup</button>
            <button class="btn btn-sm" data-action="export-csv">📄 Export CSV</button>
            <button class="btn btn-sm" data-action="demo">✨ Load demo data</button>
            <button class="btn btn-sm btn-danger" data-action="reset">🗑️ Erase all data</button>
          </div>
          <input type="file" id="importFile" accept="application/json,.json" hidden>
        </div>
      </div>
      <p class="card-sub" style="text-align:center">${state.transactions.length} transactions · ${state.debts.length} debts · ${state.categories.length} categories</p>`;
  }

  // ---------- Cloud sync UI ----------
  const SYNC_LABELS = {
    loading: ['⏳', 'Starting sync…'],
    signedout: ['☁️', 'Sign in to sync'],
    connecting: ['🔄', 'Connecting…'],
    waiting: ['📴', 'Waiting for internet'],
    syncing: ['🔄', 'Syncing…'],
    synced: ['✅', 'Synced'],
    offline: ['📴', 'Offline: will sync'],
    error: ['⚠️', 'Sync problem'],
    unavailable: ['📴', 'Sync unavailable'],
  };
  const syncInfo = () => window.BudgetSync?.info || { status: syncUnavailable ? 'unavailable' : 'loading', user: null, error: '' };
  let syncUnavailable = false;

  function renderSyncBadge() {
    const info = syncInfo();
    const [ico, label] = SYNC_LABELS[info.status] || SYNC_LABELS.loading;
    const el = $('#syncBadge');
    el.className = `sync-badge is-${info.status}`;
    el.innerHTML = `<span>${ico}</span><span class="sync-text">${label}</span>`;
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
        <div class="card-head"><h3 class="card-title">☁️ Cloud sync</h3><span class="pill">${ico} ${label}</span></div>
        ${body}
        ${info.error ? `<div class="alert red" style="margin-top:12px">⚠️ ${esc(info.error)}</div>` : ''}
      </div>`;
  }

  const RENDERERS = {
    dashboard: renderDashboard, transactions: renderTransactions, budgets: renderBudgets,
    debts: renderDebts, insights: renderInsights, settings: renderSettings,
  };

  function render() {
    $('#viewTitle').textContent = VIEW_TITLES[ui.view];
    $('#monthLabel').textContent = periodLabel(ui.month);
    $('.month-switch').style.visibility = ui.view === 'settings' || ui.view === 'debts' ? 'hidden' : 'visible';
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
      $('#overallBudget', v).onchange = (e) => { state.budgets.overall = Math.max(0, round3(e.target.value)); save(); render(); toast('🎯 Monthly budget saved'); };
      $$('[data-budget]', v).forEach((inp) => inp.onchange = () => {
        const val = Math.max(0, round3(inp.value));
        if (val) state.budgets.byCategory[inp.dataset.budget] = val;
        else delete state.budgets.byCategory[inp.dataset.budget];
        save(); render(); toast('✅ Category budget saved');
      });
    }
    if (ui.view === 'debts') {
      $$('#debtTab button', v).forEach((b) => b.onclick = () => { ui.debtTab = b.dataset.tab; render(); });
    }
    if (ui.view === 'settings') {
      $$('[data-theme-set]', v).forEach((b) => b.onclick = () => { state.settings.theme = b.dataset.themeSet; save(); applyTheme(); render(); });
      $('#importFile', v).onchange = importJson;
      $('#cycleDay', v).onchange = (e) => { state.settings.cycleDay = Number(e.target.value); save(); ui.month = currentPeriod(); render(); toast('📅 Budget month updated'); };
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
          <button type="button" data-type="expense" class="${t.type === 'expense' ? 'active is-expense' : ''}">➖ Expense</button>
          <button type="button" data-type="income" class="${t.type === 'income' ? 'active is-income' : ''}">➕ Income</button>
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
              <button type="button" class="cat-chip add-chip" data-newcat><span class="emoji">＋</span>New category</button>
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
          <button class="btn ${t.type === 'expense' ? 'btn-expense' : 'btn-income'}" type="submit" form="txForm">💾 Save</button>
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
          toast(existing ? '✅ Updated' : rec.type === 'expense' ? `💸 Expense of ${bhd(amount)} saved` : `💰 Income of ${bhd(amount)} saved`);
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
        <button type="button" data-dir="owe" class="${d.direction === 'owe' ? 'active is-expense' : ''}">🔴 I owe someone</button>
        <button type="button" data-dir="owed" class="${d.direction === 'owed' ? 'active is-income' : ''}">🟢 Someone owes me</button>
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
        <button class="btn btn-primary" type="submit" form="debtForm">💾 Save</button>
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
        save(); closeModal(); render(); toast('🤝 Debt saved');
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
        <button class="btn ${owe ? 'btn-expense' : 'btn-income'}" type="submit" form="payForm">💾 Save payment</button>
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
        toast(debtLeft(debt) === 0 ? '🎉 Debt fully settled!' : `✅ ${bhd(amount)} recorded`);
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
        ${manual ? '<button class="btn" id="pAuto">↺ Use automatic</button>' : '<button class="btn" data-close>Cancel</button>'}
        <button class="btn btn-primary" type="submit" form="periodForm">💾 Save</button>
      </div>`, (root) => {
      const done = (msg) => { save(); closeModal(); ui.month = periodKeyOf(periodStart(key)); render(); toast(msg); };
      $('#pAuto', root)?.addEventListener('click', () => { delete state.settings.cycleOverrides[key]; done('↺ Back to automatic'); });
      $('#periodForm', root).onsubmit = (e) => {
        e.preventDefault();
        const v = $('#pStart', root).value;
        if (!v) return;
        state.settings.cycleOverrides = state.settings.cycleOverrides || {};
        if (v === auto) delete state.settings.cycleOverrides[key];
        else state.settings.cycleOverrides[key] = v;
        done('📅 Month start updated');
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
      <div class="modal-foot"><button class="btn" ${onDone ? 'id="catBack"' : 'data-close'}>${onDone ? '← Back' : 'Cancel'}</button><button class="btn btn-primary" type="submit" form="catForm">💾 Save</button></div>`, (root) => {
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
        save(); render(); toast(`🗂️ Category "${rec.name}" saved`);
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
  function exportJson() { download(`budget-backup-${todayStr()}.json`, JSON.stringify(state, null, 2), 'application/json'); toast('⬇️ Backup downloaded'); }
  function exportCsv() {
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['Date', 'Type', 'Category', 'Amount (BHD)', 'Place', 'Payment method', 'Note']];
    sortTx(state.transactions).forEach((t) => rows.push([t.date, t.type, catById(t.categoryId).name, t.amount.toFixed(3), t.place, t.method, t.note]));
    download(`budget-transactions-${todayStr()}.csv`, '﻿' + rows.map((r) => r.map(q).join(',')).join('\r\n'), 'text/csv');
    toast('📄 CSV downloaded');
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
          state = normalize(data); save(); applyTheme(); render(); toast('✅ Backup restored');
        }, 'Restore');
      } catch { toast('⚠️ That file is not a valid backup'); }
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
    s.settings = state.settings;
    state = s; save(); render(); toast('✨ Demo data loaded');
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
      case 'edit-tx': { const t = state.transactions.find((x) => x.id === id); if (t) openTxForm(t.type, t); break; }
      case 'del-tx': confirmBox('This transaction will be permanently deleted.', () => {
        state.transactions = state.transactions.filter((x) => x.id !== id);
        state.debts.forEach((d) => d.payments.forEach((p) => { if (p.txId === id) delete p.txId; }));
        save(); render(); toast('🗑️ Deleted');
      }); break;
      case 'add-debt': openDebtForm(); break;
      case 'edit-debt': { const d = state.debts.find((x) => x.id === id); if (d) openDebtForm(d); break; }
      case 'pay-debt': { const d = state.debts.find((x) => x.id === id); if (d) openPaymentForm(d); break; }
      case 'del-debt': confirmBox('This debt and its payment history will be deleted. Transactions already recorded stay.', () => {
        state.debts = state.debts.filter((x) => x.id !== id); save(); render(); toast('🗑️ Debt deleted');
      }); break;
      case 'del-payment': {
        const d = state.debts.find((x) => x.id === id);
        const p = d?.payments.find((x) => x.id === el.dataset.pid);
        if (!p) break;
        confirmBox(`Remove the ${bhd(p.amount)} payment${p.txId ? ' and its linked transaction' : ''}?`, () => {
          d.payments = d.payments.filter((x) => x !== p);
          if (p.txId) state.transactions = state.transactions.filter((t) => t.id !== p.txId);
          save(); render(); toast('🗑️ Payment removed');
        }, 'Remove');
        break;
      }
      case 'add-cat': openCatForm(el.dataset.type); break;
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
          save(); render(); toast('🗑️ Category deleted');
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
        $('#soKeep', root).onclick = () => { closeModal(); window.BudgetSync?.signOut(false); toast('👋 Signed out'); };
        $('#soRemove', root).onclick = () => { closeModal(); window.BudgetSync?.signOut(true); toast('👋 Signed out and cleared this device'); };
      }); break;
      case 'export-json': exportJson(); break;
      case 'export-csv': exportCsv(); break;
      case 'import-json': $('#importFile').click(); break;
      case 'demo': confirmBox('Demo data will replace your current transactions, budgets and debts.', loadDemo, 'Load demo'); break;
      case 'reset': confirmBox('Everything (transactions, budgets, debts, categories) will be erased. Download a backup first if you need it.', () => {
        state = freshState(); save(); applyTheme(); render(); toast('🧹 All data erased');
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
