/* ============================================================
   E-Board Portal — js/portal.js
   Auth, Events + self-checkin attendance, Members, the Digital
   Library, Site Content (E-Board roster), and Gallery/slideshow.
   ============================================================ */
(() => {
'use strict';

const AUTH_URL     = '/.netlify/functions/portal-auth';
const ACCOUNTS_URL = '/.netlify/functions/portal-accounts';
const EVENTS_URL   = '/.netlify/functions/portal-events';
const MEMBERS_URL  = '/.netlify/functions/portal-members';
const POINTS_URL   = '/.netlify/functions/portal-points';
const LIBRARY_URL  = '/.netlify/functions/portal-library';
const CONTENT_URL  = '/.netlify/functions/portal-content';
const GALLERY_URL  = '/.netlify/functions/portal-gallery';
const UPLOAD_URL   = '/.netlify/functions/portal-upload';
const STATS_URL    = '/.netlify/functions/portal-stats';
const PERMISSIONS_URL = '/.netlify/functions/portal-permissions';
const TASKS_URL = '/.netlify/functions/portal-tasks';
// The chapter's permanent site-owner account — mirrors _lib/permissions.mjs's
// isPermanentAdmin(); the server is the source of truth, this is only for
// hiding the buttons it would reject anyway.
const PERMANENT_ADMIN_EMAIL = 'abretz50@gmail.com';
function isPermanentAdminEmail(email) { return String(email || '').trim().toLowerCase() === PERMANENT_ADMIN_EMAIL; }
const COMMENTS_URL = '/.netlify/functions/portal-comments';
const BUDGET_URL = '/.netlify/functions/portal-budget';

// The server computes exactly which tabs a signed-in user can use (see
// _lib/permissions.mjs's computeCanUse) and sends it back as `canUse` on
// every auth response — the client just reads that list instead of keeping
// its own copy of the permission rules, so a change made on the Permissions
// tab takes effect without needing a matching client-side edit.
const PORTAL_TABS = ['events', 'members', 'points', 'library', 'content', 'gallery', 'budget', 'accounts'];
function canUse(tab) {
  if (!me) return false;
  return (me.canUse || []).includes(tab);
}

let me = null;
let needsBootstrap = false;
let allEvents = [];
let editingEventId = null;
let allMembers = [];
let selectedMemberId = null;
let lastMemberStats = null;
let allTasks = [];
let taskAssignableMembers = [];
let taskViewMode = 'board';
let editingTaskId = null;
let libScores = [];
let libSessions = [];
let editingScoreUrl = null;
let eboardRoster = [];
let editingEboardId = null;
let siteTextData = {};
let merchItems = [];
let editingMerchId = null;
let merchSelectedSizes = [];
let resourcesData = { pd: [], showAndTell: [] };
let editingResourceId = null;
let editingResourceCategory = null;
let galleryFolders = [];
let galleryImages = [];
let galleryCurrentFolderId = null;
let gallerySelectedImageIds = new Set();
let galleryDraggingIds = null;
let galleryDraggingFolderId = null;
let budgetAccounts = {};
let budgetStats = {};
let budgetReconciliation = {};
let budgetTransactions = [];
let budgetCurrentAccount = 'regular';
let budgetTxnType = 'expense';
let editingBudgetTxnId = null;
let editingBudgetCategoryId = null;
let eventsRefreshTimer = null;
const KNOWN_VOICINGS = ['','SATB','SATB divisi','SAB','SSA','SSAA','TTBB','2-Part','Unison','Other'];
const KNOWN_INSTRS   = ['','A Cappella','Piano','Organ','Guitar','Orchestra','Chamber Ensemble','Strings','Band','Brass','Other'];
const ROLE_LABELS = {
  member: 'Member', president: 'President', admin: 'Admin', vice_president: 'Vice President',
  secretary: 'Secretary', treasurer: 'Treasurer', event_coordinator: 'Event Coordinator',
  media: 'Social Media Coordinator', senator: 'Senator', eboard_access: 'E-Board Access',
  eboard_legacy: 'E-Board (legacy)',
};
const FULL_ACCESS_ROLES = ['president', 'admin', 'eboard_legacy', 'vice_president'];

function fmtDashDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}-${d.getDate()}-${d.getFullYear()}`;
}

function toISOFromLocalInput(v){ return v ? new Date(v).toISOString() : ''; }
function toLocalInputFromISO(iso){
  if(!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
// School-year label for a date, e.g. Sept 2025 or Mar 2026 -> "2025–2026"
// (boundary: Aug 1). Used to fold past events into year folders.
function academicYearLabel(dateStr){
  const d = new Date(dateStr);
  const y = d.getFullYear(), m = d.getMonth(); // 0-indexed, so Aug = 7
  return m >= 7 ? `${y}–${y+1}` : `${y-1}–${y}`;
}
// Splits events into { upcoming: [soonest...furthest], pastByYear: [{label, events}] }.
// An event stays "upcoming" (still shown up top) for 24h after it ends, so
// it doesn't vanish from view the moment it's over — plenty of time for the
// event coordinator to still find it there right after wrapping up.
const PAST_GRACE_MS = 24 * 60 * 60 * 1000;
function groupUpcomingPast(events){
  const cutoff = new Date(Date.now() - PAST_GRACE_MS);
  const upcoming = [], past = [];
  events.forEach(ev => (new Date(ev.end || ev.start) >= cutoff ? upcoming : past).push(ev));
  upcoming.sort((a,b) => new Date(a.start) - new Date(b.start));
  past.sort((a,b) => new Date(b.start) - new Date(a.start));
  const byYear = new Map();
  past.forEach(ev => {
    const label = academicYearLabel(ev.start);
    if (!byYear.has(label)) byYear.set(label, []);
    byYear.get(label).push(ev);
  });
  const pastByYear = Array.from(byYear.entries())
    .sort((a,b) => b[0].localeCompare(a[0]))
    .map(([label, evs]) => ({ label, events: evs }));
  return { upcoming, pastByYear };
}

function fmtDateRange(startStr, endStr){
  const start = new Date(startStr); const end = endStr ? new Date(endStr) : start;
  if (isNaN(start)) return '';
  const dFmt = new Intl.DateTimeFormat('en-US', { month:'short', day:'numeric', year:'numeric' });
  const tFmt = new Intl.DateTimeFormat('en-US', { hour:'numeric', minute:'2-digit' });
  const sameDay = start.toDateString() === end.toDateString();
  return sameDay ? `${dFmt.format(start)} • ${tFmt.format(start)}–${tFmt.format(end)}`
                 : `${dFmt.format(start)} ${tFmt.format(start)} → ${dFmt.format(end)} ${tFmt.format(end)}`;
}

function escHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

async function api(url, opts = {}) {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  let data = {};
  try { data = await res.json(); } catch {}
  return { ok: res.ok && data.ok !== false, status: res.status, data };
}

async function uploadFile(file, category) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('category', category);
  const res = await fetch(UPLOAD_URL, { method: 'POST', credentials: 'include', body: fd });
  let data = {};
  try { data = await res.json(); } catch {}
  return { ok: res.ok && data.ok !== false, data };
}

// ── Login screen ──────────────────────────────────────────
function setBootstrapMode(on) {
  document.getElementById('login-name').style.display = on ? '' : 'none';
  document.getElementById('login-name').required = on;
  document.getElementById('login-secret').style.display = on ? '' : 'none';
  document.getElementById('login-secret').required = on;
  document.getElementById('login-heading').textContent = on ? 'Set up the first president account' : 'Sign in';
  document.getElementById('login-subtext').textContent = on
    ? 'No president account exists yet. Create it using the setup secret from whoever deployed the site.'
    : 'E-Board access only.';
  document.getElementById('login-submit').textContent = on ? 'Create president account' : 'Sign in';
}

async function initLogin() {
  const { data } = await api(AUTH_URL, { method: 'GET' });
  if (data.ok) {
    me = { ...data.user, canUse: data.canUse || [] };
    if (me.role === 'member') { location.replace('/account.html'); return; }
    showDashboard();
    return;
  }
  needsBootstrap = !!data.needsBootstrap;
  setBootstrapMode(needsBootstrap);
}

function wireLoginForm() {
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('login-error');
    errEl.textContent = '';
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (needsBootstrap) {
      const name = document.getElementById('login-name').value.trim();
      const secret = document.getElementById('login-secret').value;
      const { ok, data } = await api(AUTH_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'bootstrap', secret, name, email, password }),
      });
      if (!ok) { errEl.textContent = data.error || 'Setup failed.'; return; }
      me = { ...data.user, canUse: data.canUse || [] }; needsBootstrap = false; showDashboard(); window.refreshAccountNavLink?.();
      return;
    }

    const { ok, data } = await api(AUTH_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'login', email, password }),
    });
    if (!ok) { errEl.textContent = data.error || 'Sign-in failed.'; return; }
    me = { ...data.user, canUse: data.canUse || [] };
    window.refreshAccountNavLink?.();
    if (me.role === 'member') { location.replace('/account.html'); return; }
    showDashboard();
  });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await api(AUTH_URL, { method: 'POST', body: JSON.stringify({ action: 'logout' }) });
    me = null;
    clearInterval(eventsRefreshTimer);
    document.getElementById('dashboard-section').style.display = 'none';
    document.getElementById('login-section').style.display = '';
    document.getElementById('login-form').reset();
    window.refreshAccountNavLink?.();
  });
}

// ── Dashboard shell ───────────────────────────────────────
function showDashboard() {
  document.getElementById('login-section').style.display = 'none';
  document.getElementById('dashboard-section').style.display = '';
  document.getElementById('whoami').textContent = `Signed in as ${me.name} (${ROLE_LABELS[me.role] || me.role})`;

  PORTAL_TABS.forEach(tab => {
    const tabBtn = document.getElementById(`tab-${tab}`);
    if (tabBtn) tabBtn.style.display = canUse(tab) ? '' : 'none';
  });

  loadOverviewStats();
  loadRecentComments(); // shown on both Overview and Members — open to any E-Board account
  loadTasks(); // Tasks is open to any E-Board account, not permission-gated
  if (canUse('accounts')) loadAccounts();
  document.getElementById('permissions-section').style.display = canUse('permissions') ? '' : 'none';
  if (canUse('permissions')) loadPermissions();
  // loadEvents() populates the shared `allEvents` list, which the Points tab's
  // "Event Point Values" section also needs — so load it for either permission.
  if (canUse('events') || canUse('points')) {
    loadEvents();
    clearInterval(eventsRefreshTimer);
    eventsRefreshTimer = setInterval(loadEvents, 30 * 1000);
  }
  if (canUse('members')) loadMembers();
  if (canUse('points')) { loadPointsPending(); loadPointsAll(); loadAllMembersForSearch(); loadEventDefaults(); }
  if (canUse('library')) loadLibrary();
  if (canUse('content')) { loadEboardRoster(); loadSiteContentExtras(); }
  if (canUse('gallery')) loadGallery();
  if (canUse('budget')) loadBudget();
}

// ── Overview tab ──────────────────────────────────────────
// Small round avatar (profile photo, or a generic placeholder) used
// anywhere a member's name shows up — Top Earners, Recent Comments.
function avatarHTML(photoUrl, size) {
  const s = size || 26;
  // display:inline-block is required here — base.css resets every <img> to
  // display:block, which would otherwise force the photo onto its own line
  // above the name instead of sitting beside it.
  return photoUrl
    ? `<img src="${escHtml(photoUrl)}" alt="" style="display:inline-block;width:${s}px;height:${s}px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:.4rem"/>`
    : `<span style="display:inline-flex;align-items:center;justify-content:center;width:${s}px;height:${s}px;border-radius:50%;background:var(--surface);border:1px solid var(--border);vertical-align:middle;margin-right:.4rem;font-size:${Math.round(s * 0.55)}px">👤</span>`;
}

function statCardHTML(number, label, detail) {
  return `<div class="stat-card"><span class="stat-number">${number}</span><span class="stat-label">${escHtml(label)}</span>${detail ? `<span class="stat-detail">${escHtml(detail)}</span>` : ''}</div>`;
}

// Plain inline SVG line chart — no charting library needed for a handful of
// points, and it keeps this dependency-free like the rest of the site.
// Rows: [{label, count}], read left-to-right in the order given (x-axis is
// the label, y-axis is the count). Used for every trend-over-time graph on
// the portal (attendance, membership, a member's points history).
function lineChartSVG(rows, emptyMsg) {
  if (!rows.length) return `<p class="small muted">${escHtml(emptyMsg || 'No data yet.')}</p>`;
  const max = Math.max(1, ...rows.map(r => r.count));
  const min = Math.min(0, ...rows.map(r => r.count));
  const range = Math.max(1, max - min);
  const pointGap = 70, chartH = 160, axisPad = 30, topPad = 20, labelPad = 34;
  const chartW = Math.max((rows.length - 1) * pointGap + axisPad * 2, 200);
  const totalH = topPad + chartH + labelPad;
  const xFor = (i) => rows.length > 1 ? axisPad + (i * (chartW - axisPad * 2)) / (rows.length - 1) : chartW / 2;
  const yFor = (v) => topPad + chartH - ((v - min) / range) * chartH;
  const linePoints = rows.map((r, i) => `${xFor(i)},${yFor(r.count)}`).join(' ');
  const dots = rows.map((r, i) => `<g>
      <title>${escHtml(r.label)} — ${r.count}</title>
      <text x="${xFor(i)}" y="${yFor(r.count) - 10}" text-anchor="middle" font-size="11" fill="var(--text, #333)">${r.count}</text>
      <circle cx="${xFor(i)}" cy="${yFor(r.count)}" r="4" fill="var(--brand, #7A0A0A)"></circle>
      <text x="${xFor(i)}" y="${topPad + chartH + 16}" text-anchor="middle" font-size="11" fill="var(--muted, #666)">${escHtml(r.label)}</text>
    </g>`).join('');
  return `<svg viewBox="0 0 ${chartW} ${totalH}" width="100%" style="max-width:100%;min-width:${Math.min(chartW, 640)}px;font-family:inherit">
    <line x1="${axisPad}" y1="${topPad + chartH}" x2="${chartW - axisPad}" y2="${topPad + chartH}" stroke="var(--border, #ddd)"></line>
    <polyline points="${linePoints}" fill="none" stroke="var(--brand, #7A0A0A)" stroke-width="2"></polyline>
    ${dots}
  </svg>`;
}

// For the Most Attended Event card: the big red headline is the fixed
// label, the event name itself is the small gray line underneath — the
// event name varies in length far more than a stat number would.
function mostAttendedCardHTML(eventTitle) {
  return `<div class="stat-card"><span class="stat-number" style="font-size:1.1rem;line-height:1.3">Most Attended Event</span><span class="stat-label">${escHtml(eventTitle)}</span></div>`;
}

async function loadOverviewStats() {
  const gridEl = document.getElementById('overview-stats');
  const { ok, data } = await api(STATS_URL, { method: 'GET' });
  if (!ok) { gridEl.innerHTML = '<div class="admin-card"><p class="small muted">Could not load stats.</p></div>'; return; }
  const s = data.stats;
  gridEl.innerHTML = [
    statCardHTML(s.memberCount, 'Members'),
    statCardHTML(s.upcomingEventCount, 'Upcoming Events'),
    statCardHTML(s.eventsThisWeekCount, 'Events This Week'),
    statCardHTML(s.totalApprovedPoints, 'Points Awarded'),
    statCardHTML(s.pendingPointsCount, 'Pending Approvals'),
    statCardHTML(s.openTasksCount, 'Open Tasks'),
    mostAttendedCardHTML(s.mostAttendedEvent ? s.mostAttendedEvent.title : 'No events yet'),
  ].join('');

  const earnersCard = document.getElementById('overview-top-earners-card');
  const earnersEl = document.getElementById('overview-top-earners');
  if (s.topEarners.length) {
    earnersCard.style.display = '';
    earnersEl.innerHTML = s.topEarners.map((e, i) => `<div class="admin-row">
      <div><span class="name">${i + 1}.</span> ${avatarHTML(e.photoUrl)}<span class="name">${escHtml(e.name)}</span></div>
      <div class="actions"><span class="badge-role eboard">${e.total} pt${e.total !== 1 ? 's' : ''}</span></div>
    </div>`).join('');
  } else {
    earnersCard.style.display = 'none';
  }

  document.getElementById('overview-attendance-chart').innerHTML = lineChartSVG(s.attendanceOverTime, 'No attendance yet.');
}

function initTabs() {
  document.querySelectorAll('.view-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.view-tab').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active'); tab.setAttribute('aria-selected', 'true');
      document.getElementById(tab.getAttribute('aria-controls'))?.classList.add('active');
    });
  });
}

// ── Accounts tab (president-only) ────────────────────────
function accountRowHTML(a) {
  const roleBadge = `<span class="badge-role ${FULL_ACCESS_ROLES.includes(a.role) ? 'admin' : 'eboard'}">${ROLE_LABELS[a.role] || a.role}</span>`;
  const inactiveBadge = a.active === false ? `<span class="badge-role inactive">inactive</span>` : '';
  const isSelf = me && a.id === me.id;
  const isPermanentAdmin = isPermanentAdminEmail(a.email);
  // Defensive fallback for any stray role value that isn't in ROLE_LABELS
  // (shouldn't happen going forward, but keeps the dropdown from silently
  // jumping to a different role if it ever does).
  const isUnknownRole = a.role !== 'eboard_legacy' && !Object.prototype.hasOwnProperty.call(ROLE_LABELS, a.role);
  const options = Object.entries(ROLE_LABELS).filter(([k]) => k !== 'eboard_legacy')
    .map(([k, label]) => `<option value="${k}" ${a.role === k ? 'selected' : ''}>${label}</option>`).join('')
    + (isUnknownRole ? `<option value="${escHtml(a.role)}" selected>${escHtml(a.role)}</option>` : '');
  return `<div class="admin-row" data-account-id="${escHtml(a.id)}">
    <div>
      <span class="name">${escHtml(a.name)}</span> ${roleBadge}${inactiveBadge}${isPermanentAdmin ? ' <span class="badge-role admin">permanent admin</span>' : ''}
      <div class="meta">${escHtml(a.email || '')}${isSelf ? ' · you' : ''}</div>
    </div>
    <div class="actions">
      ${isPermanentAdmin
        ? ''
        : `<select class="admin-input" style="width:auto;display:inline-block" data-role-select="${escHtml(a.id)}">${options}</select>`}
      ${!isSelf && !isPermanentAdmin ? `<button class="btn-sm outline" data-toggle-active="${escHtml(a.id)}" data-next="${a.active === false ? 'true' : 'false'}">${a.active === false ? 'Reactivate' : 'Deactivate'}</button>` : ''}
      ${!isSelf && !isPermanentAdmin ? `<button class="btn-sm delete" data-remove-account="${escHtml(a.id)}">Revoke access</button>` : ''}
    </div>
  </div>`;
}

async function loadAccounts() {
  const listEl = document.getElementById('accounts-list');
  const { ok, data } = await api(ACCOUNTS_URL, { method: 'GET' });
  if (!ok) { listEl.innerHTML = `<p class="small muted">Could not load accounts.</p>`; return; }
  listEl.innerHTML = data.accounts.map(accountRowHTML).join('') || `<p class="small muted">No accounts yet.</p>`;
}

function wireAccountsPanel() {
  document.getElementById('add-account-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById('add-account-status');
    const name = document.getElementById('nu-name').value.trim();
    const email = document.getElementById('nu-email').value.trim();
    const password = document.getElementById('nu-password').value;
    const role = document.getElementById('nu-role').value;
    if (!name || !email || !password) {
      statusEl.textContent = 'Name, email, and password are required.'; statusEl.className = 'admin-status err'; return;
    }
    const { ok, data } = await api(ACCOUNTS_URL, { method: 'POST', body: JSON.stringify({ name, email, password, role }) });
    if (!ok) { statusEl.textContent = data.error || 'Could not create account.'; statusEl.className = 'admin-status err'; return; }
    statusEl.textContent = 'Account created.'; statusEl.className = 'admin-status ok';
    e.target.reset();
    loadAccounts();
  });

  document.getElementById('accounts-list').addEventListener('change', async (e) => {
    const sel = e.target.closest('[data-role-select]');
    if (!sel) return;
    const { ok, data } = await api(ACCOUNTS_URL, { method: 'PATCH', body: JSON.stringify({ id: sel.dataset.roleSelect, role: sel.value }) });
    if (!ok) { alert(data.error || 'Could not update role.'); loadAccounts(); return; }
    loadAccounts();
  });

  document.getElementById('accounts-list').addEventListener('click', async (e) => {
    const toggleBtn = e.target.closest('[data-toggle-active]');
    if (toggleBtn) {
      const { ok, data } = await api(ACCOUNTS_URL, { method: 'PATCH', body: JSON.stringify({ id: toggleBtn.dataset.toggleActive, active: toggleBtn.dataset.next === 'true' }) });
      if (!ok) { alert(data.error || 'Could not update account.'); return; }
      loadAccounts();
      return;
    }
    const removeBtn = e.target.closest('[data-remove-account]');
    if (removeBtn) {
      if (!confirm('Revoke this account\'s portal access? Their roster entry (name/email) is kept.')) return;
      const { ok, data } = await api(`${ACCOUNTS_URL}?id=${encodeURIComponent(removeBtn.dataset.removeAccount)}`, { method: 'DELETE' });
      if (!ok) { alert(data.error || 'Could not revoke access.'); return; }
      loadAccounts();
    }
  });
}

// ── Permissions (folded into the Accounts tab, president/admin-only) ────
const TAB_LABELS = {
  events: 'Events', members: 'Members', points: 'Points',
  library: 'Digital Library', gallery: 'Gallery', budget: 'Budget',
  content: 'Site Content', accounts: 'Account Management',
};

function permissionsRoleRowHTML(role, tabs, tabRoles, locked) {
  const checked = locked ? new Set(tabs) : new Set(tabs.filter(t => (tabRoles[t] || []).includes(role)));
  const boxes = tabs.map(t => `<label style="display:inline-flex;align-items:center;gap:.3rem;margin-right:.9rem;font-size:.85rem">
    <input type="checkbox" data-perm-tab="${escHtml(t)}" ${checked.has(t) ? 'checked' : ''} ${locked ? 'disabled' : ''}/> ${escHtml(TAB_LABELS[t] || t)}
  </label>`).join('');
  return `<div class="admin-row" style="align-items:flex-start;flex-wrap:wrap" data-perm-role="${escHtml(role)}">
    <div style="min-width:160px"><span class="name">${escHtml(ROLE_LABELS[role] || role)}</span>${locked ? ' <span class="badge-role admin">always full access</span>' : ''}</div>
    <div class="actions" style="flex-wrap:wrap">${boxes}${locked ? '' : `<button class="btn-sm outline" data-save-perms="${escHtml(role)}">Save</button>`}</div>
  </div>`;
}

async function loadPermissions() {
  const el = document.getElementById('permissions-list');
  const { ok, data } = await api(PERMISSIONS_URL, { method: 'GET' });
  if (!ok) { el.innerHTML = '<p class="small muted">Could not load permissions.</p>'; return; }
  const lockedRows = data.lockedRoles.map(r => permissionsRoleRowHTML(r, data.lockedTabs, data.tabRoles, true)).join('');
  const adjustableRows = data.roles.map(r => permissionsRoleRowHTML(r, data.tabs, data.tabRoles, false)).join('');
  el.innerHTML = lockedRows + adjustableRows || '<p class="small muted">No adjustable roles yet.</p>';
}

function wirePermissionsPanel() {
  document.getElementById('permissions-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-save-perms]');
    if (!btn) return;
    const row = btn.closest('[data-perm-role]');
    const tabs = [...row.querySelectorAll('[data-perm-tab]:checked')].map(cb => cb.dataset.permTab);
    const original = btn.textContent;
    btn.textContent = 'Saving…'; btn.disabled = true;
    const { ok, data } = await api(PERMISSIONS_URL, { method: 'PATCH', body: JSON.stringify({ role: btn.dataset.savePerms, tabs }) });
    btn.disabled = false;
    if (!ok) { alert(data.error || 'Could not save permissions.'); btn.textContent = original; return; }
    btn.textContent = 'Saved!'; setTimeout(() => { btn.textContent = original; }, 1200);
  });
}

// ── Tasks tab (open to any E-Board account) ───────────────
function resetTaskForm() {
  editingTaskId = null;
  document.getElementById('task-form').reset();
  document.getElementById('task-priority').value = 'medium';
  document.getElementById('task-form-heading').textContent = 'New Task';
  document.getElementById('task-form-submit').textContent = 'Create task';
  document.getElementById('task-form-cancel').style.display = 'none';
}

function populateTaskAssigneeSelect() {
  const sel = document.getElementById('task-assignee');
  const current = sel.value;
  sel.innerHTML = taskAssignableMembers.map(m => `<option value="${escHtml(m.id)}">${escHtml(m.name)}</option>`).join('');
  if (taskAssignableMembers.some(m => m.id === current)) sel.value = current;
}

// Task Board shows everyone's tasks, so its row accent is color-coded by
// assignee role (useful for scanning who has what); My Tasks is all one
// person's tasks, so role coloring there would be uniform — its accent is
// color-coded by priority instead. The priority badge/tag itself is
// always priority-colored in both views, per feedback.
const ROLE_TASK_COLORS = {
  president: '#ec4899', admin: '#ec4899', vice_president: '#8b5cf6',
  secretary: '#14b8a6', treasurer: '#22c55e', event_coordinator: '#eab308',
  media: '#3b82f6', senator: '#f97316', eboard_access: '#9ca3af', eboard_legacy: '#9ca3af',
};
const PRIORITY_TASK_COLORS = { high: '#ef4444', medium: '#eab308', low: '#3b82f6' };
const PRIORITY_BADGE_CLASSES = { high: 'badge-priority-high', medium: 'badge-priority-medium', low: 'badge-priority-low' };
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

function taskRowHTML(t) {
  const overdue = t.status === 'open' && t.dueDate && new Date(t.dueDate) < new Date(new Date().toDateString());
  const priorityBadge = `<span class="badge-role ${PRIORITY_BADGE_CLASSES[t.priority] || ''}">${t.priority}</span>`;
  const isMine = me && t.assignedToId === me.id;
  const color = taskViewMode === 'mine' ? (PRIORITY_TASK_COLORS[t.priority] || '#9ca3af') : (ROLE_TASK_COLORS[t.assignedToRole] || '#9ca3af');
  const descPreview = t.description && t.description.length > 90 ? t.description.slice(0, 88) + '…' : t.description;
  return `<div>
    <div class="admin-row${t.status === 'done' ? ' task-done' : ''}" style="cursor:pointer;box-shadow:inset 3px 0 0 ${color}" data-task-toggle="${escHtml(t.id)}">
      <div>
        <span class="name">${escHtml(t.title)}</span> ${priorityBadge}${overdue ? ' <span class="badge-role inactive">overdue</span>' : ''}${isMine ? ' <span class="badge-role eboard">mine</span>' : ''}
        <div class="meta" style="display:flex;align-items:center;gap:.3rem;flex-wrap:wrap">${avatarHTML(t.assignedToPhotoUrl, 18)}<span>For ${escHtml(t.assignedToName)} · assigned by ${escHtml(t.assignedByName)}${t.dueDate ? ' · due ' + fmtDashDate(t.dueDate) : ''}</span></div>
        ${descPreview ? `<p class="small" style="margin:.35rem 0 0">${escHtml(descPreview)}</p>` : ''}
      </div>
      <div class="actions">
        <button class="btn-sm outline" data-toggle-task="${escHtml(t.id)}" data-next="${t.status === 'done' ? 'open' : 'done'}">${t.status === 'done' ? 'Reopen' : 'Mark Done'}</button>
        <button class="btn-sm edit" data-edit-task="${escHtml(t.id)}">Edit</button>
        <button class="btn-sm delete" data-delete-task="${escHtml(t.id)}">Delete</button>
      </div>
    </div>
    <div class="task-detail-panel" id="task-detail-${escHtml(t.id)}" style="display:none;margin:.3rem 0 .7rem;padding:.6rem .8rem;background:var(--surface);border:1px solid var(--border);border-radius:.55rem">
      <p class="small" style="white-space:pre-wrap;margin:0 0 .5rem">${escHtml(t.description || 'No description.')}</p>
      <div class="meta">Created ${fmtDashDate(t.createdAt)} · Last updated ${fmtDashDate(t.updatedAt)}</div>
    </div>
  </div>`;
}

function renderTasksList() {
  const el = document.getElementById('tasks-list');
  const visible = taskViewMode === 'mine' ? allTasks.filter(t => me && t.assignedToId === me.id) : allTasks;
  const sorted = visible.slice().sort((a, b) => {
    if ((a.status === 'done') !== (b.status === 'done')) return a.status === 'done' ? 1 : -1;
    const p = (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3);
    if (p !== 0) return p;
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return new Date(a.dueDate) - new Date(b.dueDate);
  });
  el.innerHTML = sorted.map(taskRowHTML).join('') || `<p class="small muted">${taskViewMode === 'mine' ? 'No tasks assigned to you.' : 'No tasks yet.'}</p>`;
}

async function loadTasks() {
  const { ok, data } = await api(TASKS_URL, { method: 'GET' });
  if (!ok) { document.getElementById('tasks-list').innerHTML = '<p class="small muted">Could not load tasks.</p>'; return; }
  allTasks = data.tasks;
  taskAssignableMembers = data.assignableMembers;
  populateTaskAssigneeSelect();
  renderTasksList();
}

function wireTasksPanel() {
  document.querySelectorAll('[data-task-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      taskViewMode = btn.dataset.taskView;
      document.querySelectorAll('[data-task-view]').forEach(b => b.classList.toggle('active', b === btn));
      renderTasksList();
    });
  });

  document.getElementById('task-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById('task-form-status');
    const payload = {
      title: document.getElementById('task-title').value.trim(),
      description: document.getElementById('task-desc').value.trim(),
      assignedToId: document.getElementById('task-assignee').value,
      dueDate: document.getElementById('task-due').value,
      priority: document.getElementById('task-priority').value,
    };
    if (!payload.title || !payload.assignedToId) {
      statusEl.textContent = 'Title and an assignee are required.'; statusEl.className = 'admin-status err'; return;
    }
    const { ok, data } = editingTaskId
      ? await api(TASKS_URL, { method: 'PATCH', body: JSON.stringify({ id: editingTaskId, ...payload }) })
      : await api(TASKS_URL, { method: 'POST', body: JSON.stringify(payload) });
    if (!ok) { statusEl.textContent = data.error || 'Could not save task.'; statusEl.className = 'admin-status err'; return; }
    statusEl.textContent = 'Saved.'; statusEl.className = 'admin-status ok';
    resetTaskForm();
    loadTasks();
  });
  document.getElementById('task-form-cancel').addEventListener('click', resetTaskForm);

  document.getElementById('tasks-list').addEventListener('click', async (e) => {
    const toggleBtn = e.target.closest('[data-toggle-task]');
    if (toggleBtn) {
      const { ok, data } = await api(TASKS_URL, { method: 'PATCH', body: JSON.stringify({ id: toggleBtn.dataset.toggleTask, status: toggleBtn.dataset.next }) });
      if (!ok) { alert(data.error || 'Could not update task.'); return; }
      loadTasks();
      return;
    }
    const editBtn = e.target.closest('[data-edit-task]');
    if (editBtn) {
      const t = allTasks.find(x => x.id === editBtn.dataset.editTask);
      if (!t) return;
      editingTaskId = t.id;
      document.getElementById('task-title').value = t.title;
      document.getElementById('task-desc').value = t.description || '';
      populateTaskAssigneeSelect();
      document.getElementById('task-assignee').value = t.assignedToId;
      document.getElementById('task-due').value = t.dueDate || '';
      document.getElementById('task-priority').value = t.priority;
      document.getElementById('task-form-heading').textContent = 'Edit Task';
      document.getElementById('task-form-submit').textContent = 'Save changes';
      document.getElementById('task-form-cancel').style.display = '';
      document.getElementById('task-title').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const delBtn = e.target.closest('[data-delete-task]');
    if (delBtn) {
      if (!confirm('Delete this task?')) return;
      const { ok, data } = await api(`${TASKS_URL}?id=${encodeURIComponent(delBtn.dataset.deleteTask)}`, { method: 'DELETE' });
      if (!ok) { alert(data.error || 'Could not delete task.'); return; }
      loadTasks();
      return;
    }
    const toggleArea = e.target.closest('[data-task-toggle]');
    if (toggleArea) {
      const panel = document.getElementById(`task-detail-${toggleArea.dataset.taskToggle}`);
      if (panel) panel.style.display = panel.style.display === 'none' ? '' : 'none';
    }
  });
}

// ── Recent Comments (shown on both Overview and Members) ──
function recentCommentsHTML(comments) {
  return comments.map(c => `<div class="admin-row">
    <div>
      ${avatarHTML(c.photoUrl)}<span class="name">${escHtml(c.memberName)}</span>${c.parentId ? ' <span class="badge-role inactive">reply</span>' : ''}
      <div class="meta">Posted ${new Date(c.createdAt).toLocaleString()} on "${escHtml(c.eventTitle)}"</div>
      <p class="small" style="margin:.3rem 0 0">${escHtml(c.text)}</p>
    </div>
    <div class="actions"><button class="btn-sm delete" data-delete-comment="${escHtml(c.id)}">Delete</button></div>
  </div>`).join('') || '<p class="small muted">No Comments Yet!</p>';
}

async function loadRecentComments() {
  const { ok, data } = await api(COMMENTS_URL, { method: 'GET' });
  const html = ok ? recentCommentsHTML(data.comments) : '<p class="small muted">Could not load comments.</p>';
  const membersEl = document.getElementById('recent-comments-list');
  if (membersEl) membersEl.innerHTML = html;
  const overviewEl = document.getElementById('overview-comments-list');
  if (overviewEl) overviewEl.innerHTML = html;
}

function wireRecentCommentsPanel() {
  const onDeleteClick = async (e) => {
    const delBtn = e.target.closest('[data-delete-comment]');
    if (!delBtn) return;
    if (!confirm('Delete this comment?')) return;
    const { ok, data } = await api(`${COMMENTS_URL}?id=${encodeURIComponent(delBtn.dataset.deleteComment)}`, { method: 'DELETE' });
    if (!ok) { alert(data.error || 'Could not delete comment.'); return; }
    loadRecentComments();
  };
  document.getElementById('recent-comments-list').addEventListener('click', onDeleteClick);
  document.getElementById('overview-comments-list').addEventListener('click', onDeleteClick);
}

// ── Events tab ────────────────────────────────────────────
function eventRowHTML(ev) {
  const thumb = ev.imageUrl
    ? `<img src="${escHtml(ev.imageUrl)}" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:.5rem;flex-shrink:0"/>`
    : `<div style="width:44px;height:44px;border-radius:.5rem;background:var(--surface);border:1px solid var(--border);flex-shrink:0"></div>`;
  return `<div class="admin-row" style="align-items:flex-start" data-event-id="${escHtml(ev.id)}">
    <div style="display:flex;gap:.6rem;align-items:flex-start">
      ${thumb}
      <div>
        <span class="name">${escHtml(ev.title)}</span>
        <div class="meta">${escHtml(fmtDateRange(ev.start, ev.end))}${ev.location ? ' · ' + escHtml(ev.location) : ''}</div>
      </div>
    </div>
    <div class="actions">
      <button class="btn-sm edit" data-edit-event="${escHtml(ev.id)}">Edit</button>
      <button class="btn-sm delete" data-delete-event="${escHtml(ev.id)}">Delete</button>
    </div>
  </div>`;
}

function yearFolderHTML(group, rowFn) {
  return `<div class="session-group" data-year-folder="${escHtml(group.label)}">
    <div class="session-toggle-wrap">
      <button class="session-toggle" aria-expanded="false" type="button">
        <span class="session-toggle-left"><span>${escHtml(group.label)}</span><span class="session-date">${group.events.length} event${group.events.length !== 1 ? 's' : ''}</span></span>
        <span class="chevron" aria-hidden="true">&#9660;</span>
      </button>
    </div>
    <div class="session-body"><div style="display:flex;flex-direction:column;gap:.5rem">${group.events.map(rowFn).join('')}</div></div>
  </div>`;
}
function wireYearFolders(container) {
  container.querySelectorAll('.session-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const group = btn.closest('.session-group');
      const open = group.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(open));
    });
  });
}

async function loadEvents() {
  const upEl = document.getElementById('events-upcoming-list');
  const pastEl = document.getElementById('events-past-list');
  const { ok, data } = await api(`${EVENTS_URL}?admin=1`, { method: 'GET' });
  if (!ok) { upEl.innerHTML = `<p class="small muted">Could not load events.</p>`; return; }
  allEvents = data.events;
  const { upcoming, pastByYear } = groupUpcomingPast(allEvents);
  upEl.innerHTML = upcoming.map(eventRowHTML).join('') || `<p class="small muted">No upcoming events.</p>`;
  pastEl.innerHTML = pastByYear.map(g => yearFolderHTML(g, eventRowHTML)).join('') || `<p class="small muted">No past events.</p>`;
  wireYearFolders(pastEl);
  if (canUse('points')) renderEventPointsList();
}

function resetEventForm() {
  editingEventId = null;
  document.getElementById('event-form').reset();
  document.getElementById('ev-image').value = '';
  document.getElementById('ev-image-current').textContent = '';
  document.getElementById('ev-clear-signin-wrap').style.display = 'none';
  document.getElementById('ev-volunteer-wrap').style.display = 'none';
  document.getElementById('ev-slot-capacity-wrap').style.display = 'none';
  document.getElementById('event-form-heading').textContent = 'Create Event';
  document.getElementById('event-form-submit').textContent = 'Create event';
  document.getElementById('event-form-cancel').style.display = 'none';
  updateAllDayFieldsVisibility();
}

function updateVolunteerFieldsVisibility() {
  const isVolunteer = document.getElementById('ev-tags').value === 'Volunteer';
  document.getElementById('ev-volunteer-wrap').style.display = isVolunteer ? '' : 'none';
  const type = document.getElementById('ev-volunteer-type').value;
  document.getElementById('ev-slot-capacity-wrap').style.display = (isVolunteer && (type === 'bake_sale' || type === 'time_slot')) ? '' : 'none';
}

function updateAllDayFieldsVisibility() {
  const allDay = document.getElementById('ev-all-day').checked;
  document.getElementById('ev-time-fields').style.display = allDay ? 'none' : '';
  document.getElementById('ev-date-fields').style.display = allDay ? '' : 'none';
  document.getElementById('ev-start').required = !allDay;
}

function wireEventsPanel() {
  document.getElementById('ev-tags').addEventListener('change', updateVolunteerFieldsVisibility);
  document.getElementById('ev-volunteer-type').addEventListener('change', updateVolunteerFieldsVisibility);
  document.getElementById('ev-all-day').addEventListener('change', updateAllDayFieldsVisibility);

  document.getElementById('event-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById('event-form-status');
    const allDay = document.getElementById('ev-all-day').checked;

    let start, end;
    if (allDay) {
      const startDate = document.getElementById('ev-start-date').value;
      const endDate = document.getElementById('ev-end-date').value || startDate;
      if (!startDate) { statusEl.textContent = 'Start date is required.'; statusEl.className = 'admin-status err'; return; }
      if (endDate < startDate) { statusEl.textContent = 'End date can\'t be before the start date.'; statusEl.className = 'admin-status err'; return; }
      start = toISOFromLocalInput(`${startDate}T00:00`);
      end = toISOFromLocalInput(`${endDate}T23:59`);
    } else {
      const startVal = document.getElementById('ev-start').value;
      const endVal = document.getElementById('ev-end').value;
      if (endVal && endVal.slice(0, 10) !== startVal.slice(0, 10)) {
        statusEl.textContent = 'Start and end must be on the same date — check "All-day / multi-day event" above if this event spans more than one day.';
        statusEl.className = 'admin-status err';
        return;
      }
      start = toISOFromLocalInput(startVal);
      end = toISOFromLocalInput(endVal);
    }

    const existingImage = document.getElementById('ev-image').value.trim();
    const file = document.getElementById('ev-image-file').files[0];
    if (!editingEventId && !file && !existingImage) {
      statusEl.textContent = 'An image is required to create an event.'; statusEl.className = 'admin-status err'; return;
    }
    let imageUrl = existingImage;
    if (file) {
      statusEl.textContent = 'Uploading image…'; statusEl.className = 'admin-status';
      const up = await uploadFile(file, 'events');
      if (!up.ok) { statusEl.textContent = up.data.error || 'Image upload failed.'; statusEl.className = 'admin-status err'; return; }
      imageUrl = up.data.url;
    }
    const tag = document.getElementById('ev-tags').value;
    const payload = {
      title: document.getElementById('ev-title').value.trim(),
      description: document.getElementById('ev-desc').value.trim(),
      start, end, allDay,
      location: document.getElementById('ev-location').value.trim(),
      tags: [tag],
      imageUrl,
    };
    if (tag === 'Volunteer') {
      const volunteerType = document.getElementById('ev-volunteer-type').value;
      if (!volunteerType) { statusEl.textContent = 'Choose a volunteer type.'; statusEl.className = 'admin-status err'; return; }
      payload.volunteerType = volunteerType;
      if (volunteerType === 'bake_sale' || volunteerType === 'time_slot') {
        payload.slotCapacity = Number(document.getElementById('ev-slot-capacity').value) || 3;
      }
    }
    if (document.getElementById('ev-clear-signin').checked) payload.signinLink = '';
    if (!payload.title || !payload.start) {
      statusEl.textContent = 'Title and start are required.'; statusEl.className = 'admin-status err'; return;
    }
    const { ok, data } = editingEventId
      ? await api(EVENTS_URL, { method: 'PATCH', body: JSON.stringify({ id: editingEventId, ...payload }) })
      : await api(EVENTS_URL, { method: 'POST', body: JSON.stringify(payload) });
    if (!ok) { statusEl.textContent = data.error || 'Could not save event.'; statusEl.className = 'admin-status err'; return; }
    statusEl.textContent = 'Saved.'; statusEl.className = 'admin-status ok';
    resetEventForm();
    loadEvents();
  });

  document.getElementById('event-form-cancel').addEventListener('click', resetEventForm);

  const onEventsListClick = async (e) => {
    const editBtn = e.target.closest('[data-edit-event]');
    if (editBtn) {
      const ev = allEvents.find(x => x.id === editBtn.dataset.editEvent);
      if (!ev) return;
      editingEventId = ev.id;
      document.getElementById('ev-title').value = ev.title;
      document.getElementById('ev-desc').value = ev.description || '';
      document.getElementById('ev-all-day').checked = !!ev.allDay;
      document.getElementById('ev-start').value = toLocalInputFromISO(ev.start);
      document.getElementById('ev-end').value = toLocalInputFromISO(ev.end);
      document.getElementById('ev-start-date').value = toLocalInputFromISO(ev.start).slice(0, 10);
      document.getElementById('ev-end-date').value = toLocalInputFromISO(ev.end || ev.start).slice(0, 10);
      updateAllDayFieldsVisibility();
      document.getElementById('ev-location').value = ev.location || '';
      document.getElementById('ev-tags').value = (ev.tags && ev.tags[0]) || 'Event';
      document.getElementById('ev-volunteer-type').value = ev.volunteerType || '';
      document.getElementById('ev-slot-capacity').value = ev.slotCapacity || 3;
      updateVolunteerFieldsVisibility();
      document.getElementById('ev-image').value = ev.imageUrl || '';
      document.getElementById('ev-image-current').textContent = ev.imageUrl ? `Current image: ${ev.imageUrl} — choose a new one only to replace it.` : '';
      const clearSigninWrap = document.getElementById('ev-clear-signin-wrap');
      document.getElementById('ev-clear-signin').checked = false;
      clearSigninWrap.style.display = ev.signinLink ? 'flex' : 'none';
      document.getElementById('event-form-heading').textContent = 'Edit Event';
      document.getElementById('event-form-submit').textContent = 'Save changes';
      document.getElementById('event-form-cancel').style.display = '';
      document.getElementById('ev-title').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const delBtn = e.target.closest('[data-delete-event]');
    if (delBtn) {
      if (!confirm('Delete this event? Its attendance history is kept, but check-in for it will no longer be possible.')) return;
      const { ok, data } = await api(`${EVENTS_URL}?id=${encodeURIComponent(delBtn.dataset.deleteEvent)}`, { method: 'DELETE' });
      if (!ok) { alert(data.error || 'Could not delete event.'); return; }
      loadEvents();
    }
  };
  document.getElementById('events-upcoming-list').addEventListener('click', onEventsListClick);
  document.getElementById('events-past-list').addEventListener('click', onEventsListClick);
}

// ── Members tab ───────────────────────────────────────────
function memberRowHTML(m) {
  const inactiveBadge = m.active === false ? `<span class="badge-role inactive">inactive</span>` : '';
  const roleBadge = `<span class="badge-role ${FULL_ACCESS_ROLES.includes(m.role) ? 'admin' : m.role === 'member' ? 'inactive' : 'eboard'}">${escHtml(ROLE_LABELS[m.role] || m.role)}</span>`;
  const selected = m.id === selectedMemberId ? ' admin-row--selected' : '';
  const isPermanentAdmin = isPermanentAdminEmail(m.email);
  return `<div class="admin-row${selected}" style="cursor:pointer" data-member-id="${escHtml(m.id)}">
    <div>
      ${avatarHTML(m.photoUrl)}<span class="name">${escHtml(m.name)}</span> ${inactiveBadge}${roleBadge}
      <div class="meta">${escHtml(m.email)}</div>
    </div>
    <div class="actions">
      <button class="btn-sm outline" data-view-points="${escHtml(m.id)}">Points history</button>
      ${m.proflinkPointsId
        ? `<button class="btn-sm delete" data-unverify-proflink="${escHtml(m.proflinkPointsId)}" data-member-id="${escHtml(m.id)}">Unverify ProfLink</button>`
        : `<button class="btn-sm outline" data-verify-proflink="${escHtml(m.id)}">Verify ProfLink</button>`}
      ${!isPermanentAdmin ? `<button class="btn-sm outline" data-toggle-member="${escHtml(m.id)}" data-next="${m.active === false ? 'true' : 'false'}">${m.active === false ? 'Reactivate' : 'Deactivate'}</button>` : ''}
      ${!isPermanentAdmin ? `<button class="btn-sm delete" data-delete-member="${escHtml(m.id)}">Remove</button>` : ''}
    </div>
  </div>`;
}

function memberStatsCardsHTML(stats) {
  return [
    statCardHTML(stats.avgMeetingAttendance, 'Avg. Meetings / Member'),
    statCardHTML(stats.highestAttendance ? `${stats.highestAttendance.pct}%` : '—', 'Highest Meeting Attendance', stats.highestAttendance ? stats.highestAttendance.name : 'No meetings yet'),
    statCardHTML(stats.lowestAttendance ? `${stats.lowestAttendance.pct}%` : '—', 'Lowest Meeting Attendance', stats.lowestAttendance ? stats.lowestAttendance.name : 'No meetings yet'),
    statCardHTML(stats.recurringMemberCount, 'Recurring Members', 'Attended 4+ meetings this school year'),
  ].join('');
}

function showMembershipGraph() {
  selectedMemberId = null;
  document.querySelectorAll('#members-list [data-member-id]').forEach(row => row.classList.remove('admin-row--selected'));
  document.getElementById('members-graph-heading').textContent = 'Membership Over Time';
  document.getElementById('members-graph-reset').style.display = 'none';
  document.getElementById('members-graph-chart').innerHTML = lineChartSVG(lastMemberStats?.membershipOverTime || [], 'No membership data yet.');
  document.getElementById('members-graph-detail').innerHTML = '';
}

async function selectMemberPoints(memberId) {
  selectedMemberId = memberId;
  document.querySelectorAll('#members-list [data-member-id]').forEach(row => {
    row.classList.toggle('admin-row--selected', row.dataset.memberId === memberId);
  });
  const member = allMembers.find(m => m.id === memberId);
  document.getElementById('members-graph-heading').textContent = member ? `${member.name}'s Points History` : 'Points History';
  document.getElementById('members-graph-reset').style.display = '';
  const chartEl = document.getElementById('members-graph-chart');
  const detailEl = document.getElementById('members-graph-detail');
  chartEl.innerHTML = '<p class="small muted">Loading…</p>';
  detailEl.innerHTML = '';

  const { ok, data } = await api(`${POINTS_URL}?memberId=${encodeURIComponent(memberId)}`, { method: 'GET' });
  if (!ok) { chartEl.innerHTML = '<p class="small muted">Could not load points.</p>'; return; }

  const sorted = data.points.slice().sort((a, b) => new Date(a.requestedAt) - new Date(b.requestedAt));
  let running = 0;
  const chartRows = sorted.filter(p => p.status === 'approved').map(p => {
    running += p.amount;
    return { label: fmtDashDate(p.decidedAt || p.requestedAt), count: running };
  });
  chartEl.innerHTML = lineChartSVG(chartRows, 'No approved points yet.');

  const total = running;
  detailEl.innerHTML = `<div class="admin-card" style="padding:.7rem;margin-top:.6rem"><strong>${total} approved point${total !== 1 ? 's' : ''}</strong>` +
    sorted.slice().sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt)).map(p => {
      const decided = p.status !== 'pending' && p.decidedAt
        ? ` · ${p.status === 'approved' ? 'approved' : 'denied'} by ${escHtml(p.decidedByName || 'Unknown')} · ${fmtDashDate(p.decidedAt)}`
        : '';
      return `<div class="admin-row">
        <div><span class="name">${escHtml(pointsLabel(p) || 'Points')}</span><div class="meta">${new Date(p.requestedAt).toLocaleDateString()} · ${p.amount} pt${p.amount !== 1 ? 's' : ''}${decided}</div></div>
        <div class="actions"><span class="badge-role ${p.status === 'approved' ? 'eboard' : p.status === 'denied' ? 'inactive' : 'admin'}">${p.status}</span></div>
      </div>`;
    }).join('') + `${!sorted.length ? '<p class="small muted">No points yet.</p>' : ''}</div>`;
}

function renderRosterList() {
  const listEl = document.getElementById('members-list');
  const term = document.getElementById('roster-search').value.trim().toLowerCase();
  const visible = term
    ? allMembers.filter(m => m.name.toLowerCase().includes(term) || m.email.toLowerCase().includes(term))
    : allMembers;
  listEl.innerHTML = visible.map(memberRowHTML).join('') || `<p class="small muted">${term ? 'No matches.' : "No members yet — they'll also appear automatically once someone self check-ins to an event."}</p>`;
}

async function loadMembers() {
  const listEl = document.getElementById('members-list');
  const { ok, data } = await api(MEMBERS_URL, { method: 'GET' });
  if (!ok) { listEl.innerHTML = `<p class="small muted">Could not load members.</p>`; return; }
  allMembers = data.members.sort((a, b) => a.name.localeCompare(b.name));
  renderRosterList();
  document.getElementById('members-stats').innerHTML = memberStatsCardsHTML(data.stats);
  lastMemberStats = data.stats;
  if (!selectedMemberId || !allMembers.some(m => m.id === selectedMemberId)) showMembershipGraph();
}

function wireMembersPanel() {
  document.getElementById('members-graph-reset').addEventListener('click', showMembershipGraph);
  document.getElementById('roster-search').addEventListener('input', renderRosterList);

  document.getElementById('members-list').addEventListener('click', async (e) => {
    const viewBtn = e.target.closest('[data-view-points]');
    if (viewBtn) { selectMemberPoints(viewBtn.dataset.viewPoints); return; }
    const verifyBtn = e.target.closest('[data-verify-proflink]');
    if (verifyBtn) {
      const memberId = verifyBtn.dataset.verifyProflink;
      const member = allMembers.find(m => m.id === memberId);
      if (!confirm(`Award 100 points to ${member?.name || 'this member'} for being verified on ProfLink?`)) return;
      const { ok, data } = await api(POINTS_URL, { method: 'POST', body: JSON.stringify({ action: 'manualAward', memberId, amount: 100, reason: 'ProfLink verified' }) });
      if (!ok) { alert(data.error || 'Could not award points.'); return; }
      await loadMembers();
      if (selectedMemberId === memberId) selectMemberPoints(memberId);
      return;
    }
    const unverifyBtn = e.target.closest('[data-unverify-proflink]');
    if (unverifyBtn) {
      const pointsId = unverifyBtn.dataset.unverifyProflink;
      const memberId = unverifyBtn.dataset.memberId;
      const member = allMembers.find(m => m.id === memberId);
      if (!confirm(`Remove the 100 ProfLink verification points from ${member?.name || 'this member'}?`)) return;
      const { ok, data } = await api(`${POINTS_URL}?id=${encodeURIComponent(pointsId)}`, { method: 'DELETE' });
      if (!ok) { alert(data.error || 'Could not remove points.'); return; }
      await loadMembers();
      if (selectedMemberId === memberId) selectMemberPoints(memberId);
      return;
    }
    const toggleBtn = e.target.closest('[data-toggle-member]');
    if (toggleBtn) {
      const { ok, data } = await api(MEMBERS_URL, { method: 'PATCH', body: JSON.stringify({ id: toggleBtn.dataset.toggleMember, active: toggleBtn.dataset.next === 'true' }) });
      if (!ok) { alert(data.error || 'Could not update member.'); return; }
      loadMembers();
      return;
    }
    const delBtn = e.target.closest('[data-delete-member]');
    if (delBtn) {
      if (!confirm('Remove this member? Their past points history is kept.')) return;
      const { ok, data } = await api(`${MEMBERS_URL}?id=${encodeURIComponent(delBtn.dataset.deleteMember)}`, { method: 'DELETE' });
      if (!ok) { alert(data.error || 'Could not remove member.'); return; }
      loadMembers();
      return;
    }
    const row = e.target.closest('[data-member-id]');
    if (row) selectMemberPoints(row.dataset.memberId);
  });
}

// ── Points tab ────────────────────────────────────────────
// Volunteer entries carry both an eventTitle and a more specific reason
// (which slot, "brought food", etc.) — show both so the secretary can tell
// them apart at a glance instead of just seeing the event name repeated.
function pointsLabel(p) {
  if (p.eventTitle && p.reason && p.reason !== p.eventTitle) return `${p.eventTitle} — ${p.reason}`;
  return p.eventTitle || p.reason || '';
}

function pendingRowHTML(p) {
  return `<div class="admin-row" data-points-id="${escHtml(p.id)}">
    <div>
      <span class="name">${escHtml(p.memberName)}</span>
      <div class="meta">${escHtml(pointsLabel(p))} · requested ${new Date(p.requestedAt).toLocaleDateString()}</div>
    </div>
    <div class="actions">
      <input class="admin-input" type="number" min="0" value="${p.amount}" style="width:70px" data-amount-for="${escHtml(p.id)}"/>
      <button class="btn-sm" data-approve="${escHtml(p.id)}">Approve</button>
      <button class="btn-sm delete" data-deny="${escHtml(p.id)}">Deny</button>
    </div>
  </div>`;
}
function allEntryRowHTML(p) {
  const decidedClause = p.status === 'pending'
    ? ' Pending approval.'
    : ` ${p.status === 'approved' ? 'Approved' : 'Denied'} by ${escHtml(p.decidedByName || 'Unknown')} on ${fmtDashDate(p.decidedAt)}.`;
  return `<div class="admin-row">
    <div>
      <span class="name">${escHtml(pointsLabel(p) || 'Points')}</span>
      <div class="meta">${p.amount} pt${Math.abs(p.amount) !== 1 ? 's' : ''} requested by ${escHtml(p.memberName)}.${decidedClause}</div>
    </div>
    <div class="actions"><span class="badge-role ${p.status === 'approved' ? 'eboard' : p.status === 'denied' ? 'inactive' : 'admin'}">${p.status}</span></div>
  </div>`;
}

async function loadPointsPending() {
  const el = document.getElementById('points-pending-list');
  const { ok, data } = await api(`${POINTS_URL}?status=pending`, { method: 'GET' });
  if (!ok) { el.innerHTML = '<p class="small muted">Could not load.</p>'; return; }
  el.innerHTML = data.points.map(pendingRowHTML).join('') || '<p class="small muted">Nothing pending.</p>';
}

let lastPointsAllRows = [];

async function loadPointsAll() {
  const el = document.getElementById('points-all-list');
  const { ok, data } = await api(POINTS_URL, { method: 'GET' });
  if (!ok) { el.innerHTML = '<p class="small muted">Could not load.</p>'; return; }
  const rows = data.points.slice().sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));
  lastPointsAllRows = rows;
  el.innerHTML = rows.map(allEntryRowHTML).join('') || '<p class="small muted">No points entries yet.</p>';
}

// Excel opens an .xls-named file containing an HTML table just fine, so
// this needs no spreadsheet library — same dependency-free approach as
// the inline SVG charts elsewhere in this file.
function exportPointsAllXls() {
  const headers = ['Member', 'Event / Reason', 'Amount', 'Status', 'Requested', 'Decided By', 'Decided At'];
  const cell = (v) => `<td>${escHtml(String(v ?? ''))}</td>`;
  const rowsHtml = lastPointsAllRows.map(p => `<tr>${[
    cell(p.memberName),
    cell(pointsLabel(p)),
    cell(p.amount),
    cell(p.status),
    cell(new Date(p.requestedAt).toLocaleDateString()),
    cell(p.decidedByName || ''),
    cell(p.decidedAt ? fmtDashDate(p.decidedAt) : ''),
  ].join('')}</tr>`).join('');
  const html = `<html><head><meta charset="utf-8"></head><body><table border="1"><tr>${headers.map(h => `<th>${escHtml(h)}</th>`).join('')}</tr>${rowsHtml}</table></body></html>`;
  const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `points-entries-${new Date().toISOString().slice(0, 10)}.xls`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function eventPointsRowHTML(ev) {
  return `<div class="admin-row" data-event-points-row="${escHtml(ev.id)}">
    <div><span class="name">${escHtml(ev.title)}</span><div class="meta">${escHtml(fmtDateRange(ev.start, ev.end))}</div></div>
    <div class="actions">
      <input class="admin-input" type="number" min="0" value="${ev.points ?? 1}" style="width:70px" data-event-points-input="${escHtml(ev.id)}"/>
      <button class="btn-sm outline" data-save-event-points="${escHtml(ev.id)}">Save</button>
    </div>
  </div>`;
}
function renderEventPointsList() {
  const upEl = document.getElementById('event-points-upcoming');
  const pastEl = document.getElementById('event-points-past');
  if (!upEl || !pastEl) return;
  const { upcoming, pastByYear } = groupUpcomingPast(allEvents);
  upEl.innerHTML = upcoming.map(eventPointsRowHTML).join('') || '<p class="small muted">No upcoming events.</p>';
  pastEl.innerHTML = pastByYear.map(g => yearFolderHTML(g, eventPointsRowHTML)).join('') || '<p class="small muted">No past events.</p>';
  wireYearFolders(pastEl);
}

async function loadAllMembersForSearch() {
  if (allMembers.length) return;
  const { ok, data } = await api(MEMBERS_URL, { method: 'GET' });
  if (ok) allMembers = data.members;
}

function wirePointsPanel() {
  document.getElementById('points-all-export').addEventListener('click', exportPointsAllXls);

  document.getElementById('points-pending-list').addEventListener('click', async (e) => {
    const approveBtn = e.target.closest('[data-approve]');
    const denyBtn = e.target.closest('[data-deny]');
    const id = approveBtn?.dataset.approve || denyBtn?.dataset.deny;
    if (!id) return;
    const status = approveBtn ? 'approved' : 'denied';
    const amountInput = document.querySelector(`[data-amount-for="${id}"]`);
    const body = { id, status };
    if (approveBtn && amountInput) body.amount = Number(amountInput.value);
    const { ok, data } = await api(POINTS_URL, { method: 'PATCH', body: JSON.stringify(body) });
    if (!ok) { alert(data.error || 'Could not update.'); return; }
    loadPointsPending(); loadPointsAll();
  });

  const onEventPointsClick = async (e) => {
    const saveBtn = e.target.closest('[data-save-event-points]');
    if (!saveBtn) return;
    const input = document.querySelector(`[data-event-points-input="${saveBtn.dataset.saveEventPoints}"]`);
    const { ok, data } = await api(POINTS_URL, { method: 'POST', body: JSON.stringify({ action: 'setEventPoints', eventId: saveBtn.dataset.saveEventPoints, points: Number(input.value) }) });
    if (!ok) { alert(data.error || 'Could not save.'); return; }
    const ev = allEvents.find(x => x.id === saveBtn.dataset.saveEventPoints);
    if (ev) ev.points = data.event.points;
  };
  document.getElementById('event-points-upcoming').addEventListener('click', onEventPointsClick);
  document.getElementById('event-points-past').addEventListener('click', onEventPointsClick);

  const searchInput = document.getElementById('ma-member-search');
  const resultsEl = document.getElementById('ma-member-results');
  function renderMemberResults() {
    const term = searchInput.value.trim().toLowerCase();
    const matches = (term
      ? allMembers.filter(m => m.name.toLowerCase().includes(term) || m.email.toLowerCase().includes(term))
      : allMembers.slice()
    ).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 50);
    resultsEl.innerHTML = matches.map(m => `<div class="admin-row" style="cursor:pointer" data-pick-member="${escHtml(m.id)}" data-pick-name="${escHtml(m.name)}">
      <div><span class="name">${escHtml(m.name)}</span><div class="meta">${escHtml(m.email)}</div></div>
    </div>`).join('') || '<p class="small muted" style="padding:.4rem">No matches.</p>';
    resultsEl.style.display = '';
  }
  searchInput.addEventListener('focus', renderMemberResults);
  searchInput.addEventListener('input', () => {
    document.getElementById('ma-member-id').value = '';
    renderMemberResults();
  });
  document.addEventListener('click', (e) => {
    if (e.target !== searchInput && !resultsEl.contains(e.target)) resultsEl.style.display = 'none';
  });
  resultsEl.addEventListener('click', (e) => {
    const row = e.target.closest('[data-pick-member]');
    if (!row) return;
    document.getElementById('ma-member-id').value = row.dataset.pickMember;
    searchInput.value = row.dataset.pickName;
    resultsEl.style.display = 'none';
  });

  document.getElementById('manual-award-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById('manual-award-status');
    const memberId = document.getElementById('ma-member-id').value;
    const amount = document.getElementById('ma-amount').value;
    const reason = document.getElementById('ma-reason').value.trim();
    if (!memberId) { statusEl.textContent = 'Pick a member from the search results.'; statusEl.className = 'admin-status err'; return; }
    if (!amount || !reason) { statusEl.textContent = 'Amount and reason are required.'; statusEl.className = 'admin-status err'; return; }
    const { ok, data } = await api(POINTS_URL, { method: 'POST', body: JSON.stringify({ action: 'manualAward', memberId, amount, reason }) });
    if (!ok) { statusEl.textContent = data.error || 'Could not award points.'; statusEl.className = 'admin-status err'; return; }
    statusEl.textContent = 'Awarded.'; statusEl.className = 'admin-status ok';
    e.target.reset();
    loadPointsAll();
  });

  document.getElementById('event-defaults-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-save-default]');
    if (!btn) return;
    const input = document.querySelector(`[data-default-input="${btn.dataset.saveDefault}"]`);
    const original = btn.textContent;
    btn.textContent = 'Saving…'; btn.disabled = true;
    const { ok, data } = await api(POINTS_URL, { method: 'POST', body: JSON.stringify({ action: 'setEventDefault', tag: btn.dataset.saveDefault, points: Number(input.value) }) });
    btn.disabled = false;
    if (!ok) { alert(data.error || 'Could not save.'); btn.textContent = original; return; }
    btn.textContent = 'Saved!'; setTimeout(() => { btn.textContent = original; }, 1200);
  });
}

const EVENT_DEFAULT_LABELS = {
  VolunteerSlot: 'Volunteer: per half-hour slot',
  VolunteerFullDay: 'Volunteer: full day',
};

async function loadEventDefaults() {
  const el = document.getElementById('event-defaults-list');
  const { ok, data } = await api(`${POINTS_URL}?defaults=1`, { method: 'GET' });
  if (!ok) { el.innerHTML = '<p class="small muted">Could not load defaults.</p>'; return; }
  el.innerHTML = Object.entries(data.defaults).map(([tag, points]) => `<div class="admin-row">
    <div><span class="name">${escHtml(EVENT_DEFAULT_LABELS[tag] || tag)}</span></div>
    <div class="actions">
      <input class="admin-input" type="number" min="0" value="${points}" style="width:90px" data-default-input="${escHtml(tag)}"/>
      <button class="btn-sm outline" data-save-default="${escHtml(tag)}">Save</button>
    </div>
  </div>`).join('');
}

// ── Digital Library tab ───────────────────────────────────
const LIB_TAGS = ['Classical', 'Musical Theater', 'Church Music', 'Contemporary', 'Jazz & Pop', 'Sacred', 'Secular', 'A Cappella', 'Folk'];
let libManageActiveTag = 'all';

function composerDisplay(s){ return [s.composer_first, s.composer_last].filter(Boolean).join(' '); }
function arrangerDisplay(s){ return [s.arranger_first, s.arranger_last].filter(Boolean).join(' '); }
function fullCreditDisplay(s){
  const composer = composerDisplay(s), arranger = arrangerDisplay(s);
  if (composer && arranger) return `${composer} (arr. ${arranger})`;
  return composer || (arranger ? `arr. ${arranger}` : '');
}

function getSelectOrOther(selectId, otherId) {
  const sel = document.getElementById(selectId), inp = document.getElementById(otherId);
  if (!sel) return '';
  return sel.value === 'Other' ? (inp?.value.trim() || '') : sel.value;
}
function setSelectOrOther(selectId, otherId, value, known) {
  const sel = document.getElementById(selectId), inp = document.getElementById(otherId);
  if (!sel) return;
  if (!value) { sel.value = ''; if (inp) { inp.style.display = 'none'; inp.value = ''; } return; }
  if (known.includes(value)) { sel.value = value; if (inp) { inp.style.display = 'none'; inp.value = ''; } }
  else { sel.value = 'Other'; if (inp) { inp.style.display = ''; inp.value = value; } }
}
function initOtherSelect(selectId, otherId) {
  const sel = document.getElementById(selectId), inp = document.getElementById(otherId);
  if (!sel || !inp) return;
  sel.addEventListener('change', () => { inp.style.display = sel.value === 'Other' ? '' : 'none'; });
}

function scoreManageRowHTML(s) {
  const credit = fullCreditDisplay(s);
  const meta = [s.voicing, s.instrumentation, s.year].filter(Boolean).join(' · ');
  return `<div class="admin-row" data-score-url="${escHtml(s.url)}">
    <div>
      <span class="name">${escHtml(s.title)}</span>
      <div class="meta">${escHtml(credit)}${credit && meta ? ' · ' : ''}${escHtml(meta)}</div>
    </div>
    <div class="actions">
      <a class="btn-sm outline" href="${escHtml(s.url)}" target="_blank" rel="noopener">View PDF</a>
      <button class="btn-sm edit" data-edit-score="${escHtml(s.url)}">Edit</button>
      <button class="btn-sm delete" data-delete-score="${escHtml(s.url)}">Delete</button>
    </div>
  </div>`;
}

function renderLibManageChips() {
  const el = document.getElementById('lib-manage-chips');
  const used = new Set(libScores.flatMap(s => s.tags || []));
  el.innerHTML = `<button class="cat-chip ${libManageActiveTag === 'all' ? 'active' : ''}" data-lib-tag="all">All</button>` +
    LIB_TAGS.filter(t => used.has(t)).map(t =>
      `<button class="cat-chip ${libManageActiveTag === t ? 'active' : ''}" data-lib-tag="${escHtml(t)}">${escHtml(t)}</button>`
    ).join('');
}

function renderLibManageList() {
  const el = document.getElementById('lib-manage-list');
  const term = (document.getElementById('lib-manage-search').value || '').toLowerCase();
  const filtered = libScores.filter(s =>
    (libManageActiveTag === 'all' || (s.tags || []).includes(libManageActiveTag)) &&
    (!term || s.title.toLowerCase().includes(term) || fullCreditDisplay(s).toLowerCase().includes(term))
  );
  el.innerHTML = filtered.map(scoreManageRowHTML).join('') || '<p class="small muted">No scores yet.</p>';
}

function knownArchiveFolders() {
  return [...new Set(libSessions.filter(s => s.archiveFolder).map(s => s.archiveFolder))].sort();
}

function setManageRowHTML(sess) {
  const count = sess.scoreUrls.length;
  const archiveBtn = sess.archived
    ? `<button class="btn-sm outline" data-unarchive-set="${escHtml(sess.num)}">Unarchive</button>`
    : `<button class="btn-sm outline" data-archive-set="${escHtml(sess.num)}">Archive</button>`;
  const archivedMeta = sess.archived && sess.archivedAt ? ` · archived ${fmtDashDate(sess.archivedAt)}` : '';
  const folders = knownArchiveFolders();
  const archivePanel = sess.archived ? '' : `
  <div class="set-archive-panel" id="set-archive-${escHtml(sess.num)}" style="display:none;margin:.4rem 0 .8rem;padding:.6rem;background:var(--surface);border:1px solid var(--border);border-radius:.55rem">
    <div class="form-row">
      <select class="admin-input" data-archive-folder-select="${escHtml(sess.num)}">
        ${folders.map(f => `<option value="${escHtml(f)}">${escHtml(f)}</option>`).join('')}
        <option value="__new__">+ New folder…</option>
      </select>
      <input class="admin-input" type="text" placeholder="New folder name (e.g. 26-27)" data-archive-folder-new="${escHtml(sess.num)}" style="${folders.length ? 'display:none' : ''}"/>
    </div>
    <button class="btn-sm" data-confirm-archive="${escHtml(sess.num)}">Archive</button>
    <button class="btn-sm outline" data-cancel-archive="${escHtml(sess.num)}">Cancel</button>
  </div>`;
  return `<div class="admin-row" style="align-items:flex-start" data-set-num="${escHtml(sess.num)}">
    <div>
      <span class="name">${escHtml(sess.num)}: ${escHtml(sess.name)}</span>
      <div class="meta">${count} score${count !== 1 ? 's' : ''}${archivedMeta}</div>
    </div>
    <div class="actions">
      <button class="btn-sm outline" data-manage-set="${escHtml(sess.num)}">Manage scores</button>
      ${archiveBtn}
      <button class="btn-sm delete" data-delete-set="${escHtml(sess.num)}">Delete</button>
    </div>
  </div>
  ${archivePanel}
  <div class="set-manage-panel" id="set-manage-${escHtml(sess.num)}" style="display:none;margin:.4rem 0 .8rem;padding:.6rem;background:var(--surface);border:1px solid var(--border);border-radius:.55rem">
    <div id="set-current-${escHtml(sess.num)}" style="display:flex;flex-direction:column;gap:.25rem;margin-bottom:.5rem"></div>
    <input class="admin-input" type="search" placeholder="Search the library to add a score…" data-set-search="${escHtml(sess.num)}"/>
    <div id="set-search-results-${escHtml(sess.num)}" style="display:none;max-height:200px;overflow-y:auto;margin-top:.4rem;border:1px solid var(--border);border-radius:.5rem"></div>
  </div>`;
}

// Same collapsible-group shell as Events' academic-year folders (yearFolderHTML/
// wireYearFolders), reused here to group archived sets by archive folder.
function archiveFolderHTML(group, rowFn) {
  return `<div class="session-group" data-year-folder="${escHtml(group.label)}">
    <div class="session-toggle-wrap">
      <button class="session-toggle" aria-expanded="false" type="button">
        <span class="session-toggle-left"><span>${escHtml(group.label)}</span><span class="session-date">${group.sets.length} set${group.sets.length !== 1 ? 's' : ''}</span></span>
        <span class="chevron" aria-hidden="true">&#9660;</span>
      </button>
    </div>
    <div class="session-body"><div style="display:flex;flex-direction:column;gap:.5rem">${group.sets.map(rowFn).join('')}</div></div>
  </div>`;
}
function renderSetCurrentScores(sessNum) {
  const sess = libSessions.find(s => s.num === sessNum);
  const el = document.getElementById(`set-current-${sessNum}`);
  if (!sess || !el) return;
  const scores = sess.scoreUrls.map(u => libScores.find(s => s.url === u)).filter(Boolean);
  el.innerHTML = scores.map(s => `<div class="admin-row">
    <div><span class="name">${escHtml(s.title)}</span>${fullCreditDisplay(s) ? `<div class="meta">${escHtml(fullCreditDisplay(s))}</div>` : ''}</div>
    <div class="actions"><button class="btn-sm delete" data-remove-from-set="${escHtml(sessNum)}" data-url="${escHtml(s.url)}">Remove</button></div>
  </div>`).join('') || '<p class="small muted">No scores in this set yet.</p>';
}
function renderSetsManageList() {
  const active = libSessions.filter(s => !s.archived);
  const archived = libSessions.filter(s => s.archived);
  document.getElementById('sets-manage-list').innerHTML = active.map(setManageRowHTML).join('') || '<p class="small muted">No sets yet.</p>';

  const byFolder = new Map();
  archived.forEach(s => {
    const folder = s.archiveFolder || 'Unsorted';
    if (!byFolder.has(folder)) byFolder.set(folder, []);
    byFolder.get(folder).push(s);
  });
  const groups = [...byFolder.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([label, sets]) => ({ label, sets }));
  const archiveEl = document.getElementById('sets-archive-list');
  archiveEl.innerHTML = groups.map(g => archiveFolderHTML(g, setManageRowHTML)).join('') || '<p class="small muted">No archived sets.</p>';
  wireYearFolders(archiveEl);
}

async function loadLibrary() {
  const { ok, data } = await api(`${LIBRARY_URL}?admin=1`, { method: 'GET' });
  if (!ok) return;
  libScores = data.scores || [];
  libSessions = data.sessions || [];
  renderLibManageChips();
  renderLibManageList();
  renderSetsManageList();
}

function resetScoreForm() {
  editingScoreUrl = null;
  document.getElementById('score-form').reset();
  document.getElementById('sc-url').value = '';
  document.getElementById('sc-file-current').textContent = '';
  document.getElementById('sc-voicing-other').style.display = 'none';
  document.getElementById('sc-instr-other').style.display = 'none';
  document.getElementById('score-form-heading').textContent = 'Add Score';
  document.getElementById('score-form-submit').textContent = 'Add score';
  document.getElementById('score-form-cancel').style.display = 'none';
}

function wireLibraryPanel() {
  initOtherSelect('sc-voicing', 'sc-voicing-other');
  initOtherSelect('sc-instr', 'sc-instr-other');

  document.getElementById('score-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById('score-form-status');
    const title = document.getElementById('sc-title').value.trim();
    const file = document.getElementById('sc-file').files[0];
    let url = document.getElementById('sc-url').value.trim();

    if (!title) { statusEl.textContent = 'Title is required.'; statusEl.className = 'admin-status err'; return; }
    if (!file && !url) { statusEl.textContent = 'Choose a PDF to upload.'; statusEl.className = 'admin-status err'; return; }

    if (file) {
      statusEl.textContent = 'Uploading PDF…'; statusEl.className = 'admin-status';
      const up = await uploadFile(file, 'library');
      if (!up.ok) { statusEl.textContent = up.data.error || 'Upload failed.'; statusEl.className = 'admin-status err'; return; }
      url = up.data.url;
    }

    const score = {
      title, url,
      composer_first: document.getElementById('sc-cfirst').value.trim(),
      composer_last: document.getElementById('sc-clast').value.trim(),
      arranger_first: document.getElementById('sc-afirst').value.trim(),
      arranger_last: document.getElementById('sc-alast').value.trim(),
      year: document.getElementById('sc-year').value.trim(),
      voicing: getSelectOrOther('sc-voicing', 'sc-voicing-other'),
      instrumentation: getSelectOrOther('sc-instr', 'sc-instr-other'),
      tags: Array.from(document.getElementById('sc-tags').selectedOptions).map(o => o.value),
    };

    const { ok, data } = editingScoreUrl
      ? await api(LIBRARY_URL, { method: 'POST', body: JSON.stringify({ op: 'updateScore', oldUrl: editingScoreUrl, score }) })
      : await api(LIBRARY_URL, { method: 'POST', body: JSON.stringify({ op: 'addScore', score }) });
    if (!ok) { statusEl.textContent = data.error || 'Could not save score.'; statusEl.className = 'admin-status err'; return; }
    statusEl.textContent = 'Saved.'; statusEl.className = 'admin-status ok';
    libScores = data.scores; libSessions = data.sessions;
    resetScoreForm();
    renderLibManageChips(); renderLibManageList(); renderSetsManageList();
  });
  document.getElementById('score-form-cancel').addEventListener('click', resetScoreForm);
  document.getElementById('lib-manage-search').addEventListener('input', renderLibManageList);
  document.getElementById('lib-manage-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-lib-tag]');
    if (!chip) return;
    libManageActiveTag = chip.dataset.libTag;
    renderLibManageChips();
    renderLibManageList();
  });

  document.getElementById('lib-manage-list').addEventListener('click', async (e) => {
    const editBtn = e.target.closest('[data-edit-score]');
    if (editBtn) {
      const s = libScores.find(x => x.url === editBtn.dataset.editScore);
      if (!s) return;
      editingScoreUrl = s.url;
      document.getElementById('sc-title').value = s.title;
      document.getElementById('sc-cfirst').value = s.composer_first;
      document.getElementById('sc-clast').value = s.composer_last;
      document.getElementById('sc-afirst').value = s.arranger_first || '';
      document.getElementById('sc-alast').value = s.arranger_last || '';
      document.getElementById('sc-year').value = s.year;
      setSelectOrOther('sc-voicing', 'sc-voicing-other', s.voicing, KNOWN_VOICINGS);
      setSelectOrOther('sc-instr', 'sc-instr-other', s.instrumentation, KNOWN_INSTRS);
      document.getElementById('sc-url').value = s.url;
      document.getElementById('sc-file-current').textContent = `Current file: ${s.url} — choose a new PDF only if you want to replace it.`;
      Array.from(document.getElementById('sc-tags').options).forEach(o => { o.selected = s.tags.includes(o.value); });
      document.getElementById('score-form-heading').textContent = 'Edit Score';
      document.getElementById('score-form-submit').textContent = 'Save changes';
      document.getElementById('score-form-cancel').style.display = '';
      document.getElementById('sc-title').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const delBtn = e.target.closest('[data-delete-score]');
    if (delBtn) {
      if (!confirm('Delete this score from the library? It will also be removed from any sets.')) return;
      const { ok, data } = await api(LIBRARY_URL, { method: 'POST', body: JSON.stringify({ op: 'deleteScore', url: delBtn.dataset.deleteScore }) });
      if (!ok) { alert(data.error || 'Could not delete.'); return; }
      libScores = data.scores; libSessions = data.sessions;
      renderLibManageChips(); renderLibManageList(); renderSetsManageList();
    }
  });

  document.getElementById('set-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById('set-form-status');
    const num = document.getElementById('set-num').value.trim();
    const name = document.getElementById('set-name').value.trim();
    if (!num || !name) { statusEl.textContent = 'ID and name are required.'; statusEl.className = 'admin-status err'; return; }
    const { ok, data } = await api(LIBRARY_URL, { method: 'POST', body: JSON.stringify({ op: 'addSession', num, name }) });
    if (!ok) { statusEl.textContent = data.error || 'Could not create set.'; statusEl.className = 'admin-status err'; return; }
    statusEl.textContent = 'Set created.'; statusEl.className = 'admin-status ok';
    libScores = data.scores; libSessions = data.sessions;
    e.target.reset();
    renderSetsManageList();
  });

  function updateSetSummary(num) {
    const sess = libSessions.find(s => s.num === num);
    const row = document.querySelector(`[data-set-num="${num}"] .meta`);
    if (sess && row) row.textContent = `${sess.scoreUrls.length} score${sess.scoreUrls.length !== 1 ? 's' : ''}`;
  }
  function renderSetSearchResults(num) {
    const input = document.querySelector(`[data-set-search="${num}"]`);
    const resultsEl = document.getElementById(`set-search-results-${num}`);
    const sess = libSessions.find(s => s.num === num);
    const term = (input.value || '').trim().toLowerCase();
    if (!term) { resultsEl.style.display = 'none'; return; }
    const matches = libScores.filter(s => !sess.scoreUrls.includes(s.url) &&
      (s.title.toLowerCase().includes(term) || fullCreditDisplay(s).toLowerCase().includes(term))).slice(0, 10);
    resultsEl.innerHTML = matches.map(s => `<div class="admin-row">
      <div><span class="name">${escHtml(s.title)}</span>${fullCreditDisplay(s) ? `<div class="meta">${escHtml(fullCreditDisplay(s))}</div>` : ''}</div>
      <div class="actions"><button class="btn-sm" data-add-to-set="${escHtml(num)}" data-url="${escHtml(s.url)}">+ Add</button></div>
    </div>`).join('') || '<p class="small muted" style="padding:.4rem">No matches.</p>';
    resultsEl.style.display = '';
  }

  const onSetsListClick = async (e) => {
    const manageBtn = e.target.closest('[data-manage-set]');
    if (manageBtn) {
      const num = manageBtn.dataset.manageSet;
      const panel = document.getElementById(`set-manage-${num}`);
      const opening = panel.style.display === 'none';
      panel.style.display = opening ? '' : 'none';
      if (opening) renderSetCurrentScores(num);
      return;
    }
    const addBtn = e.target.closest('[data-add-to-set]');
    if (addBtn) {
      const num = addBtn.dataset.addToSet;
      const sess = libSessions.find(s => s.num === num);
      const urls = [...sess.scoreUrls, addBtn.dataset.url];
      const { ok, data } = await api(LIBRARY_URL, { method: 'POST', body: JSON.stringify({ op: 'setSessionScores', num, urls }) });
      if (!ok) { alert(data.error || 'Could not add.'); return; }
      libScores = data.scores; libSessions = data.sessions;
      renderSetCurrentScores(num);
      renderSetSearchResults(num);
      updateSetSummary(num);
      return;
    }
    const removeBtn = e.target.closest('[data-remove-from-set]');
    if (removeBtn) {
      const num = removeBtn.dataset.removeFromSet;
      const sess = libSessions.find(s => s.num === num);
      const urls = sess.scoreUrls.filter(u => u !== removeBtn.dataset.url);
      const { ok, data } = await api(LIBRARY_URL, { method: 'POST', body: JSON.stringify({ op: 'setSessionScores', num, urls }) });
      if (!ok) { alert(data.error || 'Could not remove.'); return; }
      libScores = data.scores; libSessions = data.sessions;
      renderSetCurrentScores(num);
      renderSetSearchResults(num);
      updateSetSummary(num);
      return;
    }
    const archiveBtn = e.target.closest('[data-archive-set]');
    if (archiveBtn) {
      const panel = document.getElementById(`set-archive-${archiveBtn.dataset.archiveSet}`);
      if (panel) panel.style.display = panel.style.display === 'none' ? '' : 'none';
      return;
    }
    const cancelArchiveBtn = e.target.closest('[data-cancel-archive]');
    if (cancelArchiveBtn) {
      const panel = document.getElementById(`set-archive-${cancelArchiveBtn.dataset.cancelArchive}`);
      if (panel) panel.style.display = 'none';
      return;
    }
    const confirmArchiveBtn = e.target.closest('[data-confirm-archive]');
    if (confirmArchiveBtn) {
      const num = confirmArchiveBtn.dataset.confirmArchive;
      const select = document.querySelector(`[data-archive-folder-select="${num}"]`);
      const newInput = document.querySelector(`[data-archive-folder-new="${num}"]`);
      const folder = select.value === '__new__' ? newInput.value.trim() : select.value;
      if (!folder) { alert('Enter a folder name.'); return; }
      const { ok, data } = await api(LIBRARY_URL, { method: 'POST', body: JSON.stringify({ op: 'setSessionArchived', num, archived: true, folder }) });
      if (!ok) { alert(data.error || 'Could not archive.'); return; }
      libScores = data.scores; libSessions = data.sessions;
      renderSetsManageList();
      return;
    }
    const unarchiveBtn = e.target.closest('[data-unarchive-set]');
    if (unarchiveBtn) {
      const { ok, data } = await api(LIBRARY_URL, { method: 'POST', body: JSON.stringify({ op: 'setSessionArchived', num: unarchiveBtn.dataset.unarchiveSet, archived: false }) });
      if (!ok) { alert(data.error || 'Could not unarchive.'); return; }
      libScores = data.scores; libSessions = data.sessions;
      renderSetsManageList();
      return;
    }
    const delBtn = e.target.closest('[data-delete-set]');
    if (delBtn) {
      if (!confirm('Delete this set? Scores stay in the library.')) return;
      const { ok, data } = await api(LIBRARY_URL, { method: 'POST', body: JSON.stringify({ op: 'deleteSession', num: delBtn.dataset.deleteSet }) });
      if (!ok) { alert(data.error || 'Could not delete.'); return; }
      libScores = data.scores; libSessions = data.sessions;
      renderSetsManageList();
    }
  };
  document.getElementById('sets-manage-list').addEventListener('click', onSetsListClick);
  document.getElementById('sets-archive-list').addEventListener('click', onSetsListClick);

  const onSetsListInput = (e) => {
    const input = e.target.closest('[data-set-search]');
    if (input) renderSetSearchResults(input.dataset.setSearch);
  };
  document.getElementById('sets-manage-list').addEventListener('input', onSetsListInput);
  document.getElementById('sets-archive-list').addEventListener('input', onSetsListInput);

  document.getElementById('sets-manage-list').addEventListener('change', (e) => {
    const select = e.target.closest('[data-archive-folder-select]');
    if (!select) return;
    const input = document.querySelector(`[data-archive-folder-new="${select.dataset.archiveFolderSelect}"]`);
    if (input) input.style.display = select.value === '__new__' ? '' : 'none';
  });
}

// ── Site Content (E-Board roster) tab ─────────────────────
function eboardRowHTML(p) {
  return `<div class="admin-row" data-eb-id="${escHtml(p.id)}">
    <div>
      <span class="name">${escHtml(p.role)}</span>
      <div class="meta">${escHtml(p.name)}${p.email ? ' · ' + escHtml(p.email) : ''}</div>
    </div>
    <div class="actions">
      <button class="btn-sm edit" data-edit-eb="${escHtml(p.id)}">Edit</button>
      <button class="btn-sm delete" data-delete-eb="${escHtml(p.id)}">Delete</button>
    </div>
  </div>`;
}

async function loadEboardRoster() {
  const { ok, data } = await api(CONTENT_URL, { method: 'GET' });
  if (!ok) return;
  eboardRoster = data.eboard || [];
  document.getElementById('eb-list').innerHTML = eboardRoster.map(eboardRowHTML).join('') || '<p class="small muted">No one on the roster yet.</p>';
}

function resetEboardForm() {
  editingEboardId = null;
  document.getElementById('eb-form').reset();
  document.getElementById('eb-photo-url').value = '';
  document.getElementById('eb-photo-current').textContent = '';
  document.getElementById('eb-role-other').style.display = 'none';
  document.getElementById('eb-form-heading').textContent = 'Add E-Board Member';
  document.getElementById('eb-form-submit').textContent = 'Add member';
  document.getElementById('eb-form-cancel').style.display = 'none';
}

const KNOWN_EBOARD_ROLES = ['President', 'Vice President', 'Secretary', 'Treasurer', 'Event Coordinator', 'Social Media Coordinator', 'Senator'];

function wireContentPanel() {
  document.getElementById('eb-role').addEventListener('change', (e) => {
    document.getElementById('eb-role-other').style.display = e.target.value === '__other__' ? '' : 'none';
  });

  document.getElementById('eb-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById('eb-form-status');
    const name = document.getElementById('eb-name').value.trim();
    let role = document.getElementById('eb-role').value;
    if (role === '__other__') role = document.getElementById('eb-role-other').value.trim();
    if (!name || !role) { statusEl.textContent = 'Name and role are required.'; statusEl.className = 'admin-status err'; return; }

    let photoUrl = document.getElementById('eb-photo-url').value;
    const file = document.getElementById('eb-photo-file').files[0];
    if (file) {
      statusEl.textContent = 'Uploading photo…'; statusEl.className = 'admin-status';
      const up = await uploadFile(file, 'eboard');
      if (!up.ok) { statusEl.textContent = up.data.error || 'Photo upload failed.'; statusEl.className = 'admin-status err'; return; }
      photoUrl = up.data.url;
    }

    const member = {
      name, role, email: document.getElementById('eb-email').value.trim(),
      photo: photoUrl, desc: document.getElementById('eb-desc').value.trim(),
      bio: document.getElementById('eb-bio').value.trim(),
    };
    const { ok, data } = editingEboardId
      ? await api(CONTENT_URL, { method: 'POST', body: JSON.stringify({ op: 'updateEboard', id: editingEboardId, member }) })
      : await api(CONTENT_URL, { method: 'POST', body: JSON.stringify({ op: 'addEboard', member }) });
    if (!ok) { statusEl.textContent = data.error || 'Could not save.'; statusEl.className = 'admin-status err'; return; }
    statusEl.textContent = 'Saved.'; statusEl.className = 'admin-status ok';
    eboardRoster = data.eboard;
    resetEboardForm();
    document.getElementById('eb-list').innerHTML = eboardRoster.map(eboardRowHTML).join('');
  });
  document.getElementById('eb-form-cancel').addEventListener('click', resetEboardForm);

  document.getElementById('eb-list').addEventListener('click', async (e) => {
    const editBtn = e.target.closest('[data-edit-eb]');
    if (editBtn) {
      const p = eboardRoster.find(x => x.id === editBtn.dataset.editEb);
      if (!p) return;
      editingEboardId = p.id;
      document.getElementById('eb-name').value = p.name;
      if (KNOWN_EBOARD_ROLES.includes(p.role)) {
        document.getElementById('eb-role').value = p.role;
        document.getElementById('eb-role-other').style.display = 'none';
      } else {
        document.getElementById('eb-role').value = '__other__';
        document.getElementById('eb-role-other').style.display = '';
        document.getElementById('eb-role-other').value = p.role;
      }
      document.getElementById('eb-email').value = p.email || '';
      document.getElementById('eb-photo-url').value = p.photo || '';
      document.getElementById('eb-photo-current').textContent = p.photo ? `Current: ${p.photo}` : '';
      document.getElementById('eb-desc').value = p.desc || '';
      document.getElementById('eb-bio').value = p.bio || '';
      document.getElementById('eb-form-heading').textContent = 'Edit E-Board Member';
      document.getElementById('eb-form-submit').textContent = 'Save changes';
      document.getElementById('eb-form-cancel').style.display = '';
      document.getElementById('eb-name').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const delBtn = e.target.closest('[data-delete-eb]');
    if (delBtn) {
      if (!confirm('Remove this person from the E-Board page?')) return;
      const { ok, data } = await api(CONTENT_URL, { method: 'POST', body: JSON.stringify({ op: 'deleteEboard', id: delBtn.dataset.deleteEb }) });
      if (!ok) { alert(data.error || 'Could not remove.'); return; }
      eboardRoster = data.eboard;
      document.getElementById('eb-list').innerHTML = eboardRoster.map(eboardRowHTML).join('');
    }
  });
}

// ── Site Content: page text, merch, resources ─────────────
async function loadSiteContentExtras() {
  const { ok, data } = await api(CONTENT_URL, { method: 'GET' });
  if (!ok) return;
  siteTextData = data.siteText || {};
  merchItems = data.merch || [];
  resourcesData = data.resources || { pd: [], showAndTell: [] };
  document.querySelectorAll('[data-text-key]').forEach(el => {
    const v = siteTextData[el.dataset.textKey];
    if (v !== undefined) el.value = v;
  });
  renderMerchAdminList();
  renderResourceList('pd');
  renderResourceList('showAndTell');
}

async function saveSiteTextForm(formEl, statusEl) {
  const inputs = formEl.querySelectorAll('[data-text-key]');
  statusEl.textContent = 'Saving…'; statusEl.className = 'admin-status';
  for (const el of inputs) {
    const { ok, data } = await api(CONTENT_URL, { method: 'POST', body: JSON.stringify({ op: 'updateSiteText', key: el.dataset.textKey, value: el.value }) });
    if (!ok) { statusEl.textContent = data.error || 'Could not save.'; statusEl.className = 'admin-status err'; return; }
    siteTextData = data.siteText;
  }
  statusEl.textContent = 'Saved.'; statusEl.className = 'admin-status ok';
}

function merchRowHTML(item) {
  const sizes = (item.sizes || []).join(', ') || 'No sizes';
  return `<div class="admin-row" data-merch-row="${escHtml(item.id)}">
    <div>
      <span class="name">${escHtml(item.name)}${item.active === false ? ' <span class="small muted">(inactive)</span>' : ''}</span>
      <div class="meta">$${Number(item.price).toFixed(2)} · ${escHtml(sizes)} · ${(item.photos || []).length} photo(s)</div>
    </div>
    <div class="actions">
      <button class="btn-sm edit" data-edit-merch="${escHtml(item.id)}">Edit</button>
      <button class="btn-sm delete" data-delete-merch="${escHtml(item.id)}">Delete</button>
    </div>
  </div>`;
}

function renderMerchAdminList() {
  const el = document.getElementById('merch-list-admin');
  if (!el) return;
  el.innerHTML = merchItems.map(merchRowHTML).join('') || '<p class="small muted">No merch items yet.</p>';
}

function resetMerchForm() {
  editingMerchId = null;
  merchSelectedSizes = [];
  document.getElementById('merch-form').reset();
  document.getElementById('merch-id').value = '';
  document.getElementById('merch-photo-urls').value = '';
  document.getElementById('merch-photos-current').textContent = '';
  document.getElementById('merch-active').checked = true;
  document.querySelectorAll('#merch-sizes-chips .cat-chip').forEach(c => c.classList.remove('active'));
  document.getElementById('merch-form-heading').textContent = 'Add Merch Item';
  document.getElementById('merch-form-submit').textContent = 'Add item';
  document.getElementById('merch-form-cancel').style.display = 'none';
}

function resourceRowHTML(r, category) {
  return `<div class="admin-row" data-resource-row="${escHtml(r.id)}">
    <div>
      <span class="name">${escHtml(r.title)}</span>
      <div class="meta">${r.url ? escHtml(r.url) : ''}${r.note ? ' · ' + escHtml(r.note) : ''}</div>
    </div>
    <div class="actions">
      <button class="btn-sm edit" data-edit-resource="${escHtml(r.id)}" data-resource-category="${category}">Edit</button>
      <button class="btn-sm delete" data-delete-resource="${escHtml(r.id)}" data-resource-category="${category}">Delete</button>
    </div>
  </div>`;
}

function renderResourceList(category) {
  const elId = category === 'pd' ? 'pd-resource-list' : 'showtell-resource-list';
  const el = document.getElementById(elId);
  if (!el) return;
  const items = resourcesData[category] || [];
  el.innerHTML = items.map(r => resourceRowHTML(r, category)).join('') || '<p class="small muted">Nothing added yet.</p>';
}

function resetResourceForm(category) {
  const prefix = category === 'pd' ? 'pd-resource' : 'showtell-resource';
  editingResourceId = null;
  editingResourceCategory = null;
  document.getElementById(`${prefix}-id`).value = '';
  document.getElementById(`${prefix}-title`).value = '';
  document.getElementById(`${prefix}-url`).value = '';
  document.getElementById(`${prefix}-note`).value = '';
  document.getElementById(`${prefix}-submit`).textContent = category === 'pd' ? 'Add resource' : 'Add item';
  document.getElementById(`${prefix}-cancel`).style.display = 'none';
}

function wireResourceForm(category) {
  const prefix = category === 'pd' ? 'pd-resource' : 'showtell-resource';
  document.getElementById(`${prefix}-form`).addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById(`${prefix}-status`);
    const title = document.getElementById(`${prefix}-title`).value.trim();
    if (!title) { statusEl.textContent = 'A title is required.'; statusEl.className = 'admin-status err'; return; }
    const body = {
      category,
      title,
      url: document.getElementById(`${prefix}-url`).value.trim(),
      note: document.getElementById(`${prefix}-note`).value.trim(),
    };
    const isEdit = editingResourceId && editingResourceCategory === category;
    const { ok, data } = isEdit
      ? await api(CONTENT_URL, { method: 'POST', body: JSON.stringify({ op: 'updateResource', id: editingResourceId, ...body }) })
      : await api(CONTENT_URL, { method: 'POST', body: JSON.stringify({ op: 'addResource', ...body }) });
    if (!ok) { statusEl.textContent = data.error || 'Could not save.'; statusEl.className = 'admin-status err'; return; }
    statusEl.textContent = 'Saved.'; statusEl.className = 'admin-status ok';
    resourcesData = data.resources;
    resetResourceForm(category);
    renderResourceList(category);
  });
  document.getElementById(`${prefix}-cancel`).addEventListener('click', () => resetResourceForm(category));
  document.getElementById(category === 'pd' ? 'pd-resource-list' : 'showtell-resource-list').addEventListener('click', async (e) => {
    const editBtn = e.target.closest('[data-edit-resource]');
    if (editBtn) {
      const r = (resourcesData[category] || []).find(x => x.id === editBtn.dataset.editResource);
      if (!r) return;
      editingResourceId = r.id;
      editingResourceCategory = category;
      document.getElementById(`${prefix}-id`).value = r.id;
      document.getElementById(`${prefix}-title`).value = r.title;
      document.getElementById(`${prefix}-url`).value = r.url || '';
      document.getElementById(`${prefix}-note`).value = r.note || '';
      document.getElementById(`${prefix}-submit`).textContent = 'Save changes';
      document.getElementById(`${prefix}-cancel`).style.display = '';
      return;
    }
    const delBtn = e.target.closest('[data-delete-resource]');
    if (delBtn) {
      if (!confirm('Remove this item?')) return;
      const { ok, data } = await api(CONTENT_URL, { method: 'POST', body: JSON.stringify({ op: 'deleteResource', category, id: delBtn.dataset.deleteResource }) });
      if (!ok) { alert(data.error || 'Could not remove.'); return; }
      resourcesData = data.resources;
      renderResourceList(category);
    }
  });
}

function wireSiteContentExtras() {
  document.getElementById('sitetext-home-form').addEventListener('submit', (e) => { e.preventDefault(); saveSiteTextForm(e.target, document.getElementById('sitetext-home-status')); });
  document.getElementById('sitetext-events-form').addEventListener('submit', (e) => { e.preventDefault(); saveSiteTextForm(e.target, document.getElementById('sitetext-events-status')); });
  document.getElementById('sitetext-members-form').addEventListener('submit', (e) => { e.preventDefault(); saveSiteTextForm(e.target, document.getElementById('sitetext-members-status')); });

  document.getElementById('merch-sizes-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('.cat-chip');
    if (!chip) return;
    chip.classList.toggle('active');
    const size = chip.dataset.size;
    merchSelectedSizes = chip.classList.contains('active')
      ? [...merchSelectedSizes, size]
      : merchSelectedSizes.filter(s => s !== size);
  });

  document.getElementById('merch-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById('merch-form-status');
    const name = document.getElementById('merch-name').value.trim();
    const price = parseFloat(document.getElementById('merch-price').value);
    if (!name || !(price >= 0)) { statusEl.textContent = 'A name and valid price are required.'; statusEl.className = 'admin-status err'; return; }

    let photos = document.getElementById('merch-photo-urls').value ? JSON.parse(document.getElementById('merch-photo-urls').value) : [];
    const files = Array.from(document.getElementById('merch-photos').files).slice(0, 3);
    if (files.length) {
      statusEl.textContent = 'Uploading photos…'; statusEl.className = 'admin-status';
      photos = [];
      for (const file of files) {
        const up = await uploadFile(file, 'merch');
        if (!up.ok) { statusEl.textContent = up.data.error || 'Photo upload failed.'; statusEl.className = 'admin-status err'; return; }
        photos.push(up.data.url);
      }
    }

    const item = { name, price, sizes: merchSelectedSizes, photos, active: document.getElementById('merch-active').checked };
    const { ok, data } = editingMerchId
      ? await api(CONTENT_URL, { method: 'POST', body: JSON.stringify({ op: 'updateMerchItem', id: editingMerchId, item }) })
      : await api(CONTENT_URL, { method: 'POST', body: JSON.stringify({ op: 'addMerchItem', item }) });
    if (!ok) { statusEl.textContent = data.error || 'Could not save.'; statusEl.className = 'admin-status err'; return; }
    statusEl.textContent = 'Saved.'; statusEl.className = 'admin-status ok';
    merchItems = data.merch;
    resetMerchForm();
    renderMerchAdminList();
  });
  document.getElementById('merch-form-cancel').addEventListener('click', resetMerchForm);

  document.getElementById('merch-list-admin').addEventListener('click', async (e) => {
    const editBtn = e.target.closest('[data-edit-merch]');
    if (editBtn) {
      const item = merchItems.find(x => x.id === editBtn.dataset.editMerch);
      if (!item) return;
      editingMerchId = item.id;
      merchSelectedSizes = [...(item.sizes || [])];
      document.getElementById('merch-id').value = item.id;
      document.getElementById('merch-name').value = item.name;
      document.getElementById('merch-price').value = item.price;
      document.getElementById('merch-photo-urls').value = JSON.stringify(item.photos || []);
      document.getElementById('merch-photos-current').textContent = (item.photos || []).length ? `Current: ${item.photos.length} photo(s) (choose new files to replace)` : '';
      document.getElementById('merch-active').checked = item.active !== false;
      document.querySelectorAll('#merch-sizes-chips .cat-chip').forEach(c => c.classList.toggle('active', merchSelectedSizes.includes(c.dataset.size)));
      document.getElementById('merch-form-heading').textContent = 'Edit Merch Item';
      document.getElementById('merch-form-submit').textContent = 'Save changes';
      document.getElementById('merch-form-cancel').style.display = '';
      document.getElementById('merch-name').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const delBtn = e.target.closest('[data-delete-merch]');
    if (delBtn) {
      if (!confirm('Remove this merch item from the homepage?')) return;
      const { ok, data } = await api(CONTENT_URL, { method: 'POST', body: JSON.stringify({ op: 'deleteMerchItem', id: delBtn.dataset.deleteMerch }) });
      if (!ok) { alert(data.error || 'Could not remove.'); return; }
      merchItems = data.merch;
      renderMerchAdminList();
    }
  });

  wireResourceForm('pd');
  wireResourceForm('showAndTell');
}

// ── Gallery tab (Google-Drive-style folders) ──────────────
function galleryFolderPath(folderId) {
  const path = [];
  let cur = folderId;
  while (cur) {
    const f = galleryFolders.find(x => x.id === cur);
    if (!f) break;
    path.unshift(f);
    cur = f.parentId;
  }
  return path;
}

function galleryDescendantIds(folderId) {
  const ids = [folderId];
  let frontier = [folderId];
  while (frontier.length) {
    const next = galleryFolders.filter(f => frontier.includes(f.parentId)).map(f => f.id);
    ids.push(...next);
    frontier = next;
  }
  return new Set(ids);
}

// Every folder in a subtree shares one color (a stable hash of the
// top-level ancestor's id into a small palette) so nesting reads visually,
// not just from the dash indentation — e.g. everything under "Gallery" is
// one shade, everything under "Website Data" another.
const GALLERY_COLOR_PALETTE = ['#fee2e2', '#dbeafe', '#dcfce7', '#fef9c3', '#f3e8ff', '#ffedd5', '#ccfbf1', '#fce7f3'];
function galleryTopAncestorColor(folder) {
  const path = galleryFolderPath(folder.id);
  const top = path[0];
  if (!top) return 'transparent';
  let hash = 0;
  for (let i = 0; i < top.id.length; i++) hash = (hash * 31 + top.id.charCodeAt(i)) >>> 0;
  return GALLERY_COLOR_PALETTE[hash % GALLERY_COLOR_PALETTE.length];
}

// Flat, indented "Home" + every folder (except excludeIds, so a folder
// can't be moved/copied into itself or its own subfolder) — a simple
// dropdown stands in for a full tree picker given how few folders there'll
// realistically be. There's only one tree here (no multiple "drives" to
// choose between), so the root option is just "Home", not a name.
function galleryFolderOptionsHTML(excludeIds) {
  const eligible = galleryFolders.filter(f => !excludeIds.has(f.id));
  const withPath = eligible.map(f => ({ f, path: galleryFolderPath(f.id) }));
  withPath.sort((a, b) => a.path.map(x => x.name).join('/').localeCompare(b.path.map(x => x.name).join('/')));
  const opts = withPath.map(({ f, path }) =>
    `<option value="${escHtml(f.id)}" style="background:${galleryTopAncestorColor(f)}">${'— '.repeat(path.length - 1)}${escHtml(f.name)}</option>`
  ).join('');
  return `<option value="">Home</option>${opts}`;
}

function closeGalleryMenus() {
  document.querySelectorAll('.gallery-menu-panel').forEach(el => { el.style.display = 'none'; });
}

function renderGalleryBreadcrumb() {
  const path = galleryFolderPath(galleryCurrentFolderId);
  const crumbs = [`<a href="#" data-gallery-crumb="">Home</a>`, ...path.map(f => `<a href="#" data-gallery-crumb="${escHtml(f.id)}" style="color:${galleryTopAncestorColor(f)};filter:brightness(.55)">${escHtml(f.name)}</a>`)];
  document.getElementById('gallery-breadcrumb').innerHTML = crumbs.join(' <span class="muted">/</span> ');
  document.getElementById('gallery-back-btn').style.display = path.length ? '' : 'none';

  const current = path[path.length - 1];
  const noteEl = document.getElementById('gallery-folder-note');
  if (current && current.liveTarget === 'homeSlideshow') {
    noteEl.style.display = '';
    noteEl.textContent = 'Anything dropped in this folder is live on the homepage slideshow.';
  } else if (current && current.liveTarget) {
    noteEl.style.display = '';
    noteEl.textContent = 'The topmost photo in this folder (use ▲/▼ to reorder) is live on the site.';
  } else if (current && current.note) {
    noteEl.style.display = '';
    noteEl.textContent = current.note;
  } else {
    noteEl.style.display = 'none';
  }
}

// Shared "⋮" menu (Rename / Move / Copy / Delete) for both folder and image
// tiles, plus a folder-picker panel used by both Move and Copy.
function galleryMenuHTML(kind, id) {
  return `<div style="position:absolute;top:.35rem;right:.35rem">
    <button class="btn-sm outline" data-gallery-menu-toggle="${escHtml(id)}" title="More">⋮</button>
    <div class="gallery-menu-panel" id="gallery-menu-${escHtml(id)}" style="display:none;position:absolute;right:0;top:100%;z-index:5;background:#fff;border:1px solid var(--border);border-radius:.5rem;box-shadow:0 4px 14px rgba(0,0,0,.15);padding:.4rem;min-width:170px;text-align:left">
      <button class="btn-sm outline" style="width:100%;margin-bottom:.3rem" data-gallery-rename="${escHtml(id)}" data-gallery-kind="${kind}">Rename</button>
      <button class="btn-sm outline" style="width:100%;margin-bottom:.3rem" data-gallery-mover="${escHtml(id)}" data-gallery-mover-kind="${kind}" data-gallery-mover-action="move">Move to folder</button>
      <button class="btn-sm outline" style="width:100%;margin-bottom:.3rem" data-gallery-mover="${escHtml(id)}" data-gallery-mover-kind="${kind}" data-gallery-mover-action="copy">Copy to folder</button>
      <button class="btn-sm delete" style="width:100%" data-gallery-delete="${escHtml(id)}" data-gallery-kind="${kind}">Delete</button>
    </div>
  </div>
  <div class="gallery-mover-panel" id="gallery-mover-panel-${escHtml(id)}" style="display:none;margin-top:.5rem">
    <select class="admin-input" data-gallery-mover-select="${escHtml(id)}"></select>
    <button class="btn-sm" style="margin-top:.3rem;width:100%" data-gallery-mover-confirm="${escHtml(id)}">Go</button>
  </div>`;
}

function galleryFolderTileHTML(f) {
  const childFolderCount = galleryFolders.filter(x => x.parentId === f.id).length;
  const imageCount = galleryImages.filter(x => x.folderId === f.id).length;
  const countLabel = [
    childFolderCount ? `${childFolderCount} folder${childFolderCount !== 1 ? 's' : ''}` : '',
    imageCount ? `${imageCount} photo${imageCount !== 1 ? 's' : ''}` : '',
  ].filter(Boolean).join(', ') || 'Empty';
  const badge = f.liveTarget ? ' <span class="badge-role eboard">live</span>' : '';
  const accent = galleryTopAncestorColor(f);
  return `<div class="admin-card" style="padding:.6rem;position:relative;box-shadow:inset 4px 0 0 ${accent}" data-gallery-folder-tile="${escHtml(f.id)}" draggable="true" data-gallery-draggable="${escHtml(f.id)}" data-gallery-drag-kind="folder">
    ${galleryMenuHTML('folder', f.id)}
    <div style="cursor:pointer" data-gallery-open-folder="${escHtml(f.id)}">
      <div style="font-size:2rem;text-align:center;background:${accent};border-radius:.5rem;width:2.4rem;height:2.4rem;line-height:2.4rem;margin:0 auto">📁</div>
      <div class="name" style="text-align:center;word-break:break-word;padding-right:1.4rem">${escHtml(f.name)}${badge}</div>
      <div class="small muted" style="text-align:center">${countLabel}</div>
    </div>
  </div>`;
}

function galleryImageTileHTML(img, siblings) {
  const idx = siblings.findIndex(s => s.id === img.id);
  const checked = gallerySelectedImageIds.has(img.id);
  return `<div class="admin-card" style="padding:.5rem;position:relative${checked ? ';box-shadow:0 0 0 2px var(--brand)' : ''}" data-gallery-image-tile="${escHtml(img.id)}" draggable="true" data-gallery-draggable="${escHtml(img.id)}" data-gallery-drag-kind="image">
    <input type="checkbox" data-gallery-select="${escHtml(img.id)}" ${checked ? 'checked' : ''} title="Select" style="position:absolute;top:.4rem;left:.4rem;z-index:4;width:18px;height:18px;cursor:pointer"/>
    ${galleryMenuHTML('image', img.id)}
    <img src="${escHtml(img.url)}" alt="${escHtml(img.caption || '')}" draggable="false" style="width:100%;height:110px;object-fit:cover;border-radius:.5rem;display:block"/>
    <div class="actions" style="justify-content:center;margin-top:.4rem">
      <button class="btn-sm outline" data-gallery-move-up="${escHtml(img.id)}" ${idx <= 0 ? 'disabled' : ''}>▲</button>
      <button class="btn-sm outline" data-gallery-move-down="${escHtml(img.id)}" ${idx >= siblings.length - 1 ? 'disabled' : ''}>▼</button>
    </div>
  </div>`;
}

function renderGalleryGrid() {
  const folders = galleryFolders.filter(f => f.parentId === galleryCurrentFolderId);
  const images = galleryImages.filter(i => i.folderId === galleryCurrentFolderId).sort((a, b) => a.order - b.order);
  const gridEl = document.getElementById('gallery-grid');
  gridEl.innerHTML = folders.map(galleryFolderTileHTML).join('') + images.map(img => galleryImageTileHTML(img, images)).join('') || '<p class="small muted">This folder is empty.</p>';
}

function renderGalleryBulkBar() {
  const bar = document.getElementById('gallery-bulk-bar');
  const count = gallerySelectedImageIds.size;
  if (!count) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  document.getElementById('gallery-bulk-count').textContent = `${count} photo${count !== 1 ? 's' : ''} selected`;
  // Re-rendered on every checkbox toggle (so the count stays live), which
  // would otherwise silently reset an already-chosen destination back to
  // "Home" the moment a second photo gets checked — preserve it.
  const select = document.getElementById('gallery-bulk-select');
  const previousValue = select.value;
  select.innerHTML = galleryFolderOptionsHTML(new Set());
  if ([...select.options].some(o => o.value === previousValue)) select.value = previousValue;
}

function renderGalleryView() {
  renderGalleryBreadcrumb();
  renderGalleryGrid();
  renderGalleryBulkBar();
}

async function loadGallery() {
  const { ok, data } = await api(`${GALLERY_URL}?admin=1`, { method: 'GET' });
  if (!ok) { document.getElementById('gallery-grid').innerHTML = '<p class="small muted">Could not load gallery.</p>'; return; }
  galleryFolders = data.folders || [];
  galleryImages = data.images || [];
  if (galleryCurrentFolderId && !galleryFolders.some(f => f.id === galleryCurrentFolderId)) galleryCurrentFolderId = null;
  renderGalleryView();
}

// Keeps the sticky folder-nav bar just below the site's own sticky header
// instead of pinned to the literal top of the viewport (where it'd end up
// underneath the header) — the header's height isn't a fixed constant since
// its nav can wrap on narrow screens.
function syncGalleryNavOffset() {
  const header = document.querySelector('.site-header');
  const navBar = document.getElementById('gallery-nav-bar');
  if (header && navBar) navBar.style.top = `${header.offsetHeight}px`;
}
window.addEventListener('resize', syncGalleryNavOffset);

function wireGalleryPanel() {
  syncGalleryNavOffset();
  document.getElementById('gallery-new-folder-btn').addEventListener('click', async () => {
    const name = prompt('Folder name?');
    if (!name || !name.trim()) return;
    const { ok, data } = await api(GALLERY_URL, { method: 'POST', body: JSON.stringify({ op: 'createFolder', name: name.trim(), parentId: galleryCurrentFolderId }) });
    if (!ok) { alert(data.error || 'Could not create folder.'); return; }
    galleryFolders = data.folders; galleryImages = data.images;
    renderGalleryView();
  });

  document.getElementById('gallery-back-btn').addEventListener('click', () => {
    const path = galleryFolderPath(galleryCurrentFolderId);
    galleryCurrentFolderId = path.length >= 2 ? path[path.length - 2].id : null;
    gallerySelectedImageIds.clear();
    renderGalleryView();
  });

  document.getElementById('gallery-breadcrumb').addEventListener('click', (e) => {
    const a = e.target.closest('[data-gallery-crumb]');
    if (!a) return;
    e.preventDefault();
    galleryCurrentFolderId = a.dataset.galleryCrumb || null;
    gallerySelectedImageIds.clear();
    renderGalleryView();
  });

  document.getElementById('gallery-upload-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById('gallery-upload-status');
    const file = document.getElementById('gal-file').files[0];
    const caption = document.getElementById('gal-caption').value.trim();
    if (!file) { statusEl.textContent = 'Choose a photo.'; statusEl.className = 'admin-status err'; return; }
    statusEl.textContent = 'Uploading…'; statusEl.className = 'admin-status';
    const up = await uploadFile(file, 'gallery');
    if (!up.ok) { statusEl.textContent = up.data.error || 'Upload failed.'; statusEl.className = 'admin-status err'; return; }
    const { ok, data } = await api(GALLERY_URL, { method: 'POST', body: JSON.stringify({ op: 'addImage', url: up.data.url, caption, folderId: galleryCurrentFolderId }) });
    if (!ok) { statusEl.textContent = data.error || 'Could not save.'; statusEl.className = 'admin-status err'; return; }
    statusEl.textContent = 'Uploaded.'; statusEl.className = 'admin-status ok';
    e.target.reset();
    galleryFolders = data.folders; galleryImages = data.images;
    renderGalleryView();
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.gallery-menu-panel') && !e.target.closest('[data-gallery-menu-toggle]')) closeGalleryMenus();
  });

  document.getElementById('gallery-grid').addEventListener('click', async (e) => {
    const openBtn = e.target.closest('[data-gallery-open-folder]');
    if (openBtn) {
      galleryCurrentFolderId = openBtn.dataset.galleryOpenFolder;
      gallerySelectedImageIds.clear();
      renderGalleryView();
      return;
    }

    const menuToggle = e.target.closest('[data-gallery-menu-toggle]');
    if (menuToggle) {
      const id = menuToggle.dataset.galleryMenuToggle;
      const panel = document.getElementById(`gallery-menu-${id}`);
      const wasOpen = panel.style.display !== 'none';
      closeGalleryMenus();
      panel.style.display = wasOpen ? 'none' : '';
      return;
    }

    const renameBtn = e.target.closest('[data-gallery-rename]');
    if (renameBtn) {
      closeGalleryMenus();
      const id = renameBtn.dataset.galleryRename;
      if (renameBtn.dataset.galleryKind === 'folder') {
        const folder = galleryFolders.find(f => f.id === id);
        const name = prompt('Rename folder to:', folder?.name || '');
        if (!name || !name.trim()) return;
        const { ok, data } = await api(GALLERY_URL, { method: 'POST', body: JSON.stringify({ op: 'renameFolder', id, name: name.trim() }) });
        if (!ok) { alert(data.error || 'Could not rename.'); return; }
        galleryFolders = data.folders; galleryImages = data.images;
      } else {
        const img = galleryImages.find(i => i.id === id);
        const caption = prompt('Caption for this photo:', img?.caption || '');
        if (caption === null) return;
        const { ok, data } = await api(GALLERY_URL, { method: 'PATCH', body: JSON.stringify({ id, caption: caption.trim() }) });
        if (!ok) { alert(data.error || 'Could not rename.'); return; }
        galleryFolders = data.folders; galleryImages = data.images;
      }
      renderGalleryView();
      return;
    }

    const moverBtn = e.target.closest('[data-gallery-mover]');
    if (moverBtn) {
      const id = moverBtn.dataset.galleryMover;
      const kind = moverBtn.dataset.galleryMoverKind;
      const action = moverBtn.dataset.galleryMoverAction;
      closeGalleryMenus();
      const excludeIds = kind === 'folder' ? galleryDescendantIds(id) : new Set();
      const select = document.querySelector(`[data-gallery-mover-select="${id}"]`);
      select.innerHTML = galleryFolderOptionsHTML(excludeIds);
      const panel = document.getElementById(`gallery-mover-panel-${id}`);
      panel.dataset.kind = kind;
      panel.dataset.action = action;
      panel.style.display = '';
      return;
    }
    const moverConfirmBtn = e.target.closest('[data-gallery-mover-confirm]');
    if (moverConfirmBtn) {
      const id = moverConfirmBtn.dataset.galleryMoverConfirm;
      const panel = document.getElementById(`gallery-mover-panel-${id}`);
      const select = document.querySelector(`[data-gallery-mover-select="${id}"]`);
      const { kind, action } = panel.dataset;
      const op = kind === 'folder' ? (action === 'copy' ? 'copyFolder' : 'moveFolder') : (action === 'copy' ? 'copyImage' : 'moveImage');
      const payload = { op, id };
      payload[kind === 'folder' ? 'parentId' : 'folderId'] = select.value || null;
      const { ok, data } = await api(GALLERY_URL, { method: 'POST', body: JSON.stringify(payload) });
      if (!ok) { alert(data.error || 'Could not save.'); return; }
      galleryFolders = data.folders; galleryImages = data.images;
      renderGalleryView();
      return;
    }

    const deleteBtn = e.target.closest('[data-gallery-delete]');
    if (deleteBtn) {
      closeGalleryMenus();
      const id = deleteBtn.dataset.galleryDelete;
      if (deleteBtn.dataset.galleryKind === 'folder') {
        if (!confirm('Delete this folder and everything inside it? This cannot be undone.')) return;
        const { ok, data } = await api(GALLERY_URL, { method: 'POST', body: JSON.stringify({ op: 'deleteFolder', id }) });
        if (!ok) { alert(data.error || 'Could not delete folder.'); return; }
        galleryFolders = data.folders; galleryImages = data.images;
      } else {
        if (!confirm('Delete this photo?')) return;
        const { ok, data } = await api(`${GALLERY_URL}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (!ok) { alert(data.error || 'Could not delete.'); return; }
        galleryFolders = data.folders; galleryImages = data.images;
      }
      renderGalleryView();
      return;
    }

    const moveUpBtn = e.target.closest('[data-gallery-move-up]');
    const moveDownBtn = e.target.closest('[data-gallery-move-down]');
    if (moveUpBtn || moveDownBtn) {
      const id = moveUpBtn ? moveUpBtn.dataset.galleryMoveUp : moveDownBtn.dataset.galleryMoveDown;
      const siblings = galleryImages.filter(i => i.folderId === galleryCurrentFolderId).sort((a, b) => a.order - b.order);
      const idx = siblings.findIndex(s => s.id === id);
      const swapWith = moveUpBtn ? idx - 1 : idx + 1;
      if (idx === -1 || swapWith < 0 || swapWith >= siblings.length) return;
      const reordered = [...siblings];
      [reordered[idx], reordered[swapWith]] = [reordered[swapWith], reordered[idx]];
      const { ok, data } = await api(GALLERY_URL, { method: 'POST', body: JSON.stringify({ op: 'reorderImages', ids: reordered.map(i => i.id) }) });
      if (!ok) { alert(data.error || 'Could not reorder.'); return; }
      galleryFolders = data.folders; galleryImages = data.images;
      renderGalleryView();
    }
  });

  // Multi-select checkboxes
  document.getElementById('gallery-grid').addEventListener('change', (e) => {
    const cb = e.target.closest('[data-gallery-select]');
    if (!cb) return;
    if (cb.checked) gallerySelectedImageIds.add(cb.dataset.gallerySelect);
    else gallerySelectedImageIds.delete(cb.dataset.gallerySelect);
    renderGalleryView();
  });

  document.getElementById('gallery-bulk-clear').addEventListener('click', () => {
    gallerySelectedImageIds.clear();
    renderGalleryView();
  });
  const runBulkAction = async (op) => {
    const folderId = document.getElementById('gallery-bulk-select').value || null;
    const ids = [...gallerySelectedImageIds];
    const { ok, data } = await api(GALLERY_URL, { method: 'POST', body: JSON.stringify({ op, ids, folderId }) });
    if (!ok) { alert(data.error || 'Could not complete that action.'); return; }
    gallerySelectedImageIds.clear();
    galleryFolders = data.folders; galleryImages = data.images;
    renderGalleryView();
  };
  document.getElementById('gallery-bulk-copy').addEventListener('click', () => runBulkAction('bulkCopyImages'));
  document.getElementById('gallery-bulk-move').addEventListener('click', () => runBulkAction('bulkMoveImages'));
  document.getElementById('gallery-bulk-delete').addEventListener('click', async () => {
    const count = gallerySelectedImageIds.size;
    if (!confirm(`Delete ${count} photo${count !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    const ids = [...gallerySelectedImageIds];
    const { ok, data } = await api(GALLERY_URL, { method: 'POST', body: JSON.stringify({ op: 'bulkDeleteImages', ids }) });
    if (!ok) { alert(data.error || 'Could not delete.'); return; }
    gallerySelectedImageIds.clear();
    galleryFolders = data.folders; galleryImages = data.images;
    renderGalleryView();
  });

  // Drag a photo (or the whole current selection, if the dragged one is
  // part of it) onto a folder tile to move it there.
  const gridEl = document.getElementById('gallery-grid');
  const isDragActive = () => galleryDraggingIds || galleryDraggingFolderId;
  // Drops onto a folder tile move into it; drops onto a breadcrumb crumb or
  // the Back button move "out" to that (shallower) folder — same handler
  // either way, just a different destination id.
  const dropOntoFolder = async (folderId) => {
    if (galleryDraggingFolderId) {
      const sourceFolderId = galleryDraggingFolderId;
      galleryDraggingFolderId = null;
      if (sourceFolderId === folderId) return;
      const { ok, data } = await api(GALLERY_URL, { method: 'POST', body: JSON.stringify({ op: 'moveFolder', id: sourceFolderId, parentId: folderId }) });
      if (!ok) { alert(data.error || 'Could not move folder.'); return; }
      galleryFolders = data.folders; galleryImages = data.images;
      renderGalleryView();
      return;
    }
    if (galleryDraggingIds) {
      const ids = galleryDraggingIds;
      galleryDraggingIds = null;
      const { ok, data } = await api(GALLERY_URL, { method: 'POST', body: JSON.stringify({ op: 'bulkMoveImages', ids, folderId }) });
      if (!ok) { alert(data.error || 'Could not move.'); return; }
      gallerySelectedImageIds.clear();
      galleryFolders = data.folders; galleryImages = data.images;
      renderGalleryView();
    }
  };

  gridEl.addEventListener('dragstart', (e) => {
    const tile = e.target.closest('[data-gallery-draggable]');
    if (!tile) return;
    const id = tile.dataset.galleryDraggable;
    if (tile.dataset.galleryDragKind === 'folder') {
      galleryDraggingIds = null;
      galleryDraggingFolderId = id;
    } else {
      galleryDraggingFolderId = null;
      galleryDraggingIds = (gallerySelectedImageIds.has(id) && gallerySelectedImageIds.size > 1)
        ? [...gallerySelectedImageIds] : [id];
    }
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', id); } catch {}
  });
  gridEl.addEventListener('dragenter', (e) => {
    if (!isDragActive()) return;
    if (e.target.closest('[data-gallery-folder-tile]')) e.preventDefault();
  });
  gridEl.addEventListener('dragover', (e) => {
    if (!isDragActive()) return;
    const folderTile = e.target.closest('[data-gallery-folder-tile]');
    if (!folderTile) return;
    e.preventDefault();
    folderTile.style.outline = '2px solid var(--brand)';
  });
  gridEl.addEventListener('dragleave', (e) => {
    const folderTile = e.target.closest('[data-gallery-folder-tile]');
    if (folderTile) folderTile.style.outline = '';
  });
  gridEl.addEventListener('drop', async (e) => {
    const folderTile = e.target.closest('[data-gallery-folder-tile]');
    if (!folderTile || !isDragActive()) return;
    e.preventDefault();
    folderTile.style.outline = '';
    await dropOntoFolder(folderTile.dataset.galleryFolderTile);
  });
  gridEl.addEventListener('dragend', () => { galleryDraggingIds = null; galleryDraggingFolderId = null; });

  // Breadcrumb and Back button as drop targets, so a folder (or photo) can
  // be dragged "out" to a shallower level without needing that ancestor's
  // tile to be visible in the current grid.
  const crumbBar = document.getElementById('gallery-breadcrumb');
  crumbBar.addEventListener('dragover', (e) => {
    if (!isDragActive()) return;
    const crumb = e.target.closest('[data-gallery-crumb]');
    if (!crumb) return;
    e.preventDefault();
    crumb.style.outline = '2px solid var(--brand)';
  });
  crumbBar.addEventListener('dragleave', (e) => {
    const crumb = e.target.closest('[data-gallery-crumb]');
    if (crumb) crumb.style.outline = '';
  });
  crumbBar.addEventListener('drop', async (e) => {
    const crumb = e.target.closest('[data-gallery-crumb]');
    if (!crumb || !isDragActive()) return;
    e.preventDefault();
    crumb.style.outline = '';
    await dropOntoFolder(crumb.dataset.galleryCrumb || null);
  });
  const backBtn = document.getElementById('gallery-back-btn');
  backBtn.addEventListener('dragover', (e) => {
    if (!isDragActive()) return;
    e.preventDefault();
    backBtn.style.outline = '2px solid var(--brand)';
  });
  backBtn.addEventListener('dragleave', () => { backBtn.style.outline = ''; });
  backBtn.addEventListener('drop', async (e) => {
    if (!isDragActive()) return;
    e.preventDefault();
    backBtn.style.outline = '';
    const path = galleryFolderPath(galleryCurrentFolderId);
    const parentId = path.length >= 2 ? path[path.length - 2].id : null;
    await dropOntoFolder(parentId);
  });
}

// ── Budget tab ─────────────────────────────────────────────
function fmtMoney(n) {
  const v = Number(n) || 0;
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Green when non-negative, red when negative — used for "Remaining" and
// "Net Raised", the two numbers where the sign itself is the headline.
function budgetSignedMoney(n) {
  const v = Number(n) || 0;
  return `<span style="color:${v < 0 ? '#ef4444' : '#16a34a'}">${fmtMoney(v)}</span>`;
}

function budgetProgressBarHTML(spent, planned) {
  const pct = planned > 0 ? Math.min(100, (spent / planned) * 100) : (spent > 0 ? 100 : 0);
  const over = planned > 0 && spent > planned;
  const color = over ? '#ef4444' : pct > 85 ? '#eab308' : 'var(--brand)';
  return `<div style="background:var(--surface);border-radius:999px;height:8px;overflow:hidden;margin-top:.35rem">
    <div style="width:${pct}%;height:100%;background:${color}"></div>
  </div>`;
}

// Regular and Convention Trip are both "we were given/asked for a capped
// amount, now we're spending it down" accounts — same card layout. Only
// Fundraising is fundamentally different (a balance fed by income, not a
// fixed allocation), so it gets its own layout.
const BUDGET_CAP_STYLE_ACCOUNTS = ['regular', 'convention'];
const BUDGET_CAP_LABELS = {
  regular: 'Budget Cap (SGA Allocation)',
  convention: 'SGA Ask (Ceiling)',
};

function budgetStatCardsHTML() {
  const s = budgetStats[budgetCurrentAccount] || {};
  if (BUDGET_CAP_STYLE_ACCOUNTS.includes(budgetCurrentAccount)) {
    const remaining = (s.targetAmount || 0) + (s.startingBalance || 0) - (s.totalSpent || 0);
    const overPlan = (s.plannedTotal || 0) > (s.targetAmount || 0);
    return [
      statCardHTML(fmtMoney(s.targetAmount), BUDGET_CAP_LABELS[budgetCurrentAccount] || 'Budget Cap'),
      statCardHTML(fmtMoney(s.totalSpent), 'Total Spent'),
      statCardHTML(budgetSignedMoney(remaining), remaining < 0 ? 'Over Budget' : 'Remaining', s.startingBalance ? `Includes ${fmtMoney(s.startingBalance)} carried over` : ''),
      statCardHTML(fmtMoney(s.plannedTotal), 'Total Planned (Categories)', overPlan ? 'Plan exceeds the cap' : 'Within the cap'),
    ].join('');
  }
  const balance = s.currentBalance || 0;
  return [
    statCardHTML(fmtMoney(s.targetAmount), 'Fundraising Goal (target, not a cap)'),
    statCardHTML(budgetSignedMoney(balance), balance < 0 ? 'Current Balance (Deficit)' : 'Current Balance', balance < 0 ? 'Raise more to cover spending' : 'Raising at least as much as spent'),
    statCardHTML(fmtMoney(s.totalIncome), 'Raised (logged here)'),
    statCardHTML(fmtMoney(s.totalSpent), 'Spent (logged here)'),
  ].join('');
}

const BUDGET_ACCOUNT_DESCRIPTIONS = {
  regular: 'Money the SGA has already allocated to us — a fixed amount to spend down across the categories below.',
  fundraising: 'Money we raise ourselves (bake sales, merch, etc.), not a fixed allocation. The Goal is a target; the Current Balance is what’s actually in the account right now. The rule: raise at least as much as we spend from it.',
  convention: 'A separate special SGA request for the 2027 ACDA National Conference trip — kept apart from the Regular and Fundraising accounts above, but tracked here too.',
};

function budgetCategoryRowHTML(cat) {
  const over = cat.spent > cat.plannedAmount;
  const revenueBit = cat.account === 'fundraising' ? ` · planned revenue ${fmtMoney(cat.plannedRevenue || 0)}` : '';
  return `<div class="admin-row" style="align-items:flex-start" data-budget-cat-row="${escHtml(cat.id)}">
    <div style="flex:1">
      <span class="name">${escHtml(cat.name)}</span>${over ? ' <span class="badge-role inactive">over budget</span>' : ''}
      <div class="meta">${fmtMoney(cat.spent)} spent of ${fmtMoney(cat.plannedAmount)} planned${revenueBit}</div>
      ${budgetProgressBarHTML(cat.spent, cat.plannedAmount)}
    </div>
    <div class="actions">
      <button class="btn-sm outline" data-budget-edit-category="${escHtml(cat.id)}">Edit</button>
    </div>
  </div>`;
}

function renderBudgetCategoriesList() {
  const s = budgetStats[budgetCurrentAccount] || { categories: [] };
  document.getElementById('budget-categories-list').innerHTML =
    s.categories.map(budgetCategoryRowHTML).join('') || '<p class="small muted">No categories yet.</p>';
}

function populateBudgetTxnCategorySelect() {
  const sel = document.getElementById('budget-txn-category');
  const s = budgetStats[budgetCurrentAccount] || { categories: [] };
  const current = sel.value;
  sel.innerHTML = '<option value="">No category</option>' + s.categories.map(c => `<option value="${escHtml(c.id)}">${escHtml(c.name)}</option>`).join('');
  if (s.categories.some(c => c.id === current)) sel.value = current;
}

function renderBudgetChart() {
  const txns = budgetTransactions.filter(t => t.account === budgetCurrentAccount && t.type === 'expense')
    .slice().sort((a, b) => new Date(a.date) - new Date(b.date));
  let running = 0;
  const rows = txns.map(t => { running += t.amount; return { label: fmtDashDate(t.date), count: Math.round(running * 100) / 100 }; });
  document.getElementById('budget-chart').innerHTML = lineChartSVG(rows, 'No expenses logged yet.');
}

function budgetTransactionRowHTML(t) {
  const cat = (budgetStats[t.account]?.categories || []).find(c => c.id === t.categoryId);
  const catLabel = cat ? cat.name : (t.categoryId ? 'Uncategorized' : (t.type === 'income' ? 'Fundraiser income' : 'Uncategorized'));
  const sign = t.type === 'income' ? '+' : '-';
  const amountColor = t.type === 'income' ? '#16a34a' : 'var(--brand)';
  return `<div class="admin-row">
    <div>
      <span class="name">${escHtml(t.description)}</span>${t.type === 'income' ? ' <span class="badge-role eboard">income</span>' : ''}${t.linkId ? ' <span class="badge-role inactive" title="Logged together as one fundraiser">🔗 linked</span>' : ''}
      <div class="meta">${escHtml(catLabel)} · ${fmtDashDate(t.date)} · logged by ${escHtml(t.addedByName)}</div>
    </div>
    <div class="actions">
      <span class="name" style="color:${amountColor}">${sign}${fmtMoney(t.amount)}</span>
      <button class="btn-sm edit" data-budget-edit-txn="${escHtml(t.id)}">Edit</button>
      <button class="btn-sm delete" data-budget-delete-txn="${escHtml(t.id)}">Delete</button>
    </div>
  </div>`;
}

function renderBudgetTransactionsList() {
  const rows = budgetTransactions.filter(t => t.account === budgetCurrentAccount).slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  document.getElementById('budget-transactions-list').innerHTML =
    rows.map(budgetTransactionRowHTML).join('') || '<p class="small muted">No transactions yet.</p>';
}

function exportBudgetTxnsXls() {
  const rows = budgetTransactions.filter(t => t.account === budgetCurrentAccount).slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  const headers = ['Date', 'Type', 'Category', 'Description', 'Amount', 'Logged By'];
  const cell = (v) => `<td>${escHtml(String(v ?? ''))}</td>`;
  const rowsHtml = rows.map(t => {
    const cat = (budgetStats[t.account]?.categories || []).find(c => c.id === t.categoryId);
    return `<tr>${[
      cell(fmtDashDate(t.date)), cell(t.type), cell(cat ? cat.name : (t.categoryId ? 'Uncategorized' : '')),
      cell(t.description), cell(t.amount), cell(t.addedByName),
    ].join('')}</tr>`;
  }).join('');
  const accountLabel = budgetCurrentAccount === 'regular' ? 'regular' : 'fundraising';
  const html = `<html><head><meta charset="utf-8"></head><body><table border="1"><tr>${headers.map(h => `<th>${escHtml(h)}</th>`).join('')}</tr>${rowsHtml}</table></body></html>`;
  const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `budget-${accountLabel}-${new Date().toISOString().slice(0, 10)}.xls`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function renderBudgetReconciliation() {
  const r = budgetReconciliation || {};
  const el = document.getElementById('budget-reconciliation-text');
  if (typeof r.combinedCapacity !== 'number') { el.textContent = 'Loading…'; return; }
  const matches = Math.abs(r.difference) < 0.01;
  el.innerHTML = `Regular Budget Cap + Fundraising Goal = <strong>${fmtMoney(r.combinedCapacity)}</strong> total planned spending capacity. `
    + `Actual total planned across both accounts' categories: <strong>${fmtMoney(r.combinedPlanned)}</strong>. `
    + (matches
      ? '<span style="color:#16a34a">These match.</span>'
      : `<span style="color:#ef4444">Off by ${fmtMoney(Math.abs(r.difference))} ${r.difference > 0 ? '(capacity unused)' : '(over capacity)'}.</span>`);
}

function renderBudgetView() {
  document.getElementById('budget-stats').innerHTML = budgetStatCardsHTML();
  document.getElementById('budget-account-description').textContent = BUDGET_ACCOUNT_DESCRIPTIONS[budgetCurrentAccount] || '';
  renderBudgetReconciliation();
  renderBudgetCategoriesList();
  populateBudgetTxnCategorySelect();
  renderBudgetChart();
  renderBudgetTransactionsList();
  // Logging income (or a combined fundraiser cost+revenue entry) only makes
  // sense for the fundraising account.
  const isFundraising = budgetCurrentAccount === 'fundraising';
  document.getElementById('budget-income-chip').style.display = isFundraising ? '' : 'none';
  document.getElementById('budget-fundraiser-chip').style.display = isFundraising ? '' : 'none';
  if (!isFundraising && budgetTxnType !== 'expense') {
    budgetTxnType = 'expense';
    document.querySelectorAll('#budget-txn-type-chips [data-txn-type]').forEach(b => b.classList.toggle('active', b.dataset.txnType === 'expense'));
  }
  const isFundraiserEntry = budgetTxnType === 'fundraiser';
  document.getElementById('budget-fundraiser-hint').style.display = isFundraiserEntry ? '' : 'none';
  document.getElementById('budget-fundraiser-amounts-row').style.display = isFundraiserEntry ? '' : 'none';
  document.getElementById('budget-txn-amount').style.display = isFundraiserEntry ? 'none' : '';
  document.getElementById('budget-txn-amount').required = !isFundraiserEntry;
  if (!editingBudgetTxnId) {
    document.getElementById('budget-txn-submit').textContent =
      budgetTxnType === 'income' ? 'Add income' : budgetTxnType === 'fundraiser' ? 'Log fundraiser' : 'Add expense';
  }
}

async function loadBudget() {
  const { ok, data } = await api(BUDGET_URL, { method: 'GET' });
  if (!ok) { document.getElementById('budget-stats').innerHTML = '<div class="admin-card"><p class="small muted">Could not load budget.</p></div>'; return; }
  budgetAccounts = data.accounts;
  budgetStats = data.stats.accounts; budgetReconciliation = data.stats.reconciliation;
  budgetTransactions = data.transactions;
  renderBudgetView();
}

function resetBudgetTxnForm() {
  editingBudgetTxnId = null;
  document.getElementById('budget-txn-form').reset();
  document.getElementById('budget-txn-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('budget-txn-form-heading').textContent = 'Log a Purchase';
  document.getElementById('budget-txn-cancel').style.display = 'none';
  budgetTxnType = 'expense';
  document.querySelectorAll('#budget-txn-type-chips [data-txn-type]').forEach(b => b.classList.toggle('active', b.dataset.txnType === 'expense'));
  document.getElementById('budget-txn-submit').textContent = 'Add expense';
}

function resetBudgetCategoryForm() {
  editingBudgetCategoryId = null;
  document.getElementById('budget-category-form').reset();
  document.getElementById('budget-category-form-heading').textContent = 'New Category';
  document.getElementById('budget-category-delete-btn').style.display = 'none';
  document.getElementById('budget-category-form-card').style.display = 'none';
  document.getElementById('budget-cat-revenue-group').style.display = budgetCurrentAccount === 'fundraising' ? '' : 'none';
}

function wireBudgetPanel() {
  document.getElementById('budget-account-chips').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-budget-account]');
    if (!btn) return;
    budgetCurrentAccount = btn.dataset.budgetAccount;
    document.querySelectorAll('#budget-account-chips [data-budget-account]').forEach(b => b.classList.toggle('active', b === btn));
    resetBudgetTxnForm();
    resetBudgetCategoryForm();
    renderBudgetView();
  });

  document.getElementById('budget-edit-target-btn').addEventListener('click', async () => {
    const current = budgetAccounts[budgetCurrentAccount]?.targetAmount ?? 0;
    const targetLabels = { regular: 'the Regular Account budget cap', fundraising: 'the Fundraising / Extra Account goal', convention: 'the Convention Trip SGA ask' };
    const input = prompt(`New amount for ${targetLabels[budgetCurrentAccount] || 'this account'}:`, current);
    if (input === null) return;
    const targetAmount = Number(input);
    if (!targetAmount && targetAmount !== 0) { alert('Enter a valid amount.'); return; }
    const { ok, data } = await api(BUDGET_URL, { method: 'POST', body: JSON.stringify({ op: 'setAccountTarget', account: budgetCurrentAccount, targetAmount }) });
    if (!ok) { alert(data.error || 'Could not update.'); return; }
    budgetAccounts = data.accounts; budgetStats = data.stats.accounts; budgetReconciliation = data.stats.reconciliation;
    renderBudgetView();
  });

  document.getElementById('budget-edit-balance-btn').addEventListener('click', async () => {
    const current = budgetAccounts[budgetCurrentAccount]?.startingBalance ?? 0;
    const accountLabels = { regular: 'the Regular Account', fundraising: 'the Fundraising / Extra Account', convention: 'the Convention Trip account' };
    const input = prompt(`Current real-world balance of ${accountLabels[budgetCurrentAccount] || 'this account'} (what's actually in the account right now, before anything logged here):`, current);
    if (input === null) return;
    const startingBalance = Number(input);
    if (!startingBalance && startingBalance !== 0) { alert('Enter a valid amount.'); return; }
    const { ok, data } = await api(BUDGET_URL, { method: 'POST', body: JSON.stringify({ op: 'setStartingBalance', account: budgetCurrentAccount, startingBalance }) });
    if (!ok) { alert(data.error || 'Could not update.'); return; }
    budgetAccounts = data.accounts; budgetStats = data.stats.accounts; budgetReconciliation = data.stats.reconciliation;
    renderBudgetView();
  });

  document.getElementById('budget-new-category-btn').addEventListener('click', () => {
    resetBudgetCategoryForm();
    document.getElementById('budget-category-form-card').style.display = '';
    document.getElementById('budget-cat-name').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  document.getElementById('budget-category-form-cancel').addEventListener('click', resetBudgetCategoryForm);

  document.getElementById('budget-categories-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-budget-edit-category]');
    if (!btn) return;
    const id = btn.dataset.budgetEditCategory;
    const cat = (budgetStats[budgetCurrentAccount]?.categories || []).find(c => c.id === id);
    if (!cat) return;
    editingBudgetCategoryId = id;
    document.getElementById('budget-cat-id').value = id;
    document.getElementById('budget-cat-name').value = cat.name;
    document.getElementById('budget-cat-planned').value = cat.plannedAmount;
    document.getElementById('budget-cat-revenue-group').style.display = cat.account === 'fundraising' ? '' : 'none';
    document.getElementById('budget-cat-revenue').value = cat.plannedRevenue || '';
    document.getElementById('budget-category-form-heading').textContent = 'Edit Category';
    document.getElementById('budget-category-delete-btn').style.display = '';
    document.getElementById('budget-category-form-card').style.display = '';
    document.getElementById('budget-cat-name').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  document.getElementById('budget-category-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById('budget-category-status');
    const name = document.getElementById('budget-cat-name').value.trim();
    const plannedAmount = Number(document.getElementById('budget-cat-planned').value);
    const plannedRevenue = Number(document.getElementById('budget-cat-revenue').value) || 0;
    if (!name) { statusEl.textContent = 'Category name is required.'; statusEl.className = 'admin-status err'; return; }
    const body = editingBudgetCategoryId
      ? { op: 'updateCategory', id: editingBudgetCategoryId, name, plannedAmount, plannedRevenue }
      : { op: 'createCategory', account: budgetCurrentAccount, name, plannedAmount, plannedRevenue };
    const { ok, data } = await api(BUDGET_URL, { method: 'POST', body: JSON.stringify(body) });
    if (!ok) { statusEl.textContent = data.error || 'Could not save category.'; statusEl.className = 'admin-status err'; return; }
    budgetStats = data.stats.accounts; budgetReconciliation = data.stats.reconciliation;
    resetBudgetCategoryForm();
    renderBudgetView();
  });

  document.getElementById('budget-category-delete-btn').addEventListener('click', async () => {
    if (!editingBudgetCategoryId) return;
    if (!confirm('Delete this category? Existing transactions in it will show as Uncategorized.')) return;
    const { ok, data } = await api(BUDGET_URL, { method: 'POST', body: JSON.stringify({ op: 'deleteCategory', id: editingBudgetCategoryId }) });
    if (!ok) { alert(data.error || 'Could not delete category.'); return; }
    budgetTransactions = data.transactions; budgetStats = data.stats.accounts; budgetReconciliation = data.stats.reconciliation;
    resetBudgetCategoryForm();
    renderBudgetView();
  });

  document.getElementById('budget-txn-type-chips').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-txn-type]');
    if (!btn) return;
    budgetTxnType = btn.dataset.txnType;
    document.querySelectorAll('#budget-txn-type-chips [data-txn-type]').forEach(b => b.classList.toggle('active', b === btn));
    renderBudgetView();
  });

  document.getElementById('budget-txn-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById('budget-txn-status');
    const categoryId = document.getElementById('budget-txn-category').value || null;
    const description = document.getElementById('budget-txn-desc').value.trim();
    const date = document.getElementById('budget-txn-date').value;
    let body;
    if (!editingBudgetTxnId && budgetTxnType === 'fundraiser') {
      body = {
        op: 'addFundraiserEvent', categoryId, description, date,
        cost: document.getElementById('budget-txn-cost').value,
        revenue: document.getElementById('budget-txn-revenue').value,
      };
    } else {
      body = {
        op: editingBudgetTxnId ? 'updateTransaction' : 'addTransaction',
        account: budgetCurrentAccount,
        type: budgetTxnType,
        categoryId, description, date,
        amount: Number(document.getElementById('budget-txn-amount').value),
      };
      if (editingBudgetTxnId) body.id = editingBudgetTxnId;
    }
    const { ok, data } = await api(BUDGET_URL, { method: 'POST', body: JSON.stringify(body) });
    if (!ok) { statusEl.textContent = data.error || 'Could not save.'; statusEl.className = 'admin-status err'; return; }
    statusEl.textContent = 'Saved.'; statusEl.className = 'admin-status ok';
    budgetTransactions = data.transactions; budgetStats = data.stats.accounts; budgetReconciliation = data.stats.reconciliation;
    resetBudgetTxnForm();
    renderBudgetView();
  });
  document.getElementById('budget-txn-cancel').addEventListener('click', resetBudgetTxnForm);

  document.getElementById('budget-transactions-list').addEventListener('click', async (e) => {
    const editBtn = e.target.closest('[data-budget-edit-txn]');
    if (editBtn) {
      const t = budgetTransactions.find(x => x.id === editBtn.dataset.budgetEditTxn);
      if (!t) return;
      editingBudgetTxnId = t.id;
      budgetTxnType = t.type;
      document.querySelectorAll('#budget-txn-type-chips [data-txn-type]').forEach(b => b.classList.toggle('active', b.dataset.txnType === t.type));
      document.getElementById('budget-txn-category').value = t.categoryId || '';
      document.getElementById('budget-txn-desc').value = t.description;
      document.getElementById('budget-txn-amount').value = t.amount;
      document.getElementById('budget-txn-date').value = t.date;
      document.getElementById('budget-txn-form-heading').textContent = 'Edit Transaction';
      document.getElementById('budget-txn-submit').textContent = 'Save changes';
      document.getElementById('budget-txn-cancel').style.display = '';
      document.getElementById('budget-fundraiser-hint').style.display = 'none';
      document.getElementById('budget-fundraiser-amounts-row').style.display = 'none';
      document.getElementById('budget-txn-amount').style.display = '';
      document.getElementById('budget-txn-amount').required = true;
      document.getElementById('budget-txn-desc').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const delBtn = e.target.closest('[data-budget-delete-txn]');
    if (delBtn) {
      if (!confirm('Delete this transaction?')) return;
      const { ok, data } = await api(`${BUDGET_URL}?id=${encodeURIComponent(delBtn.dataset.budgetDeleteTxn)}`, { method: 'DELETE' });
      if (!ok) { alert(data.error || 'Could not delete.'); return; }
      budgetTransactions = data.transactions; budgetStats = data.stats.accounts; budgetReconciliation = data.stats.reconciliation;
      renderBudgetView();
    }
  });

  document.getElementById('budget-export-btn').addEventListener('click', exportBudgetTxnsXls);
}

// ── Boot ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  wireLoginForm();
  wireAccountsPanel();
  wirePermissionsPanel();
  wireTasksPanel();
  wireRecentCommentsPanel();
  wireEventsPanel();
  wireMembersPanel();
  wirePointsPanel();
  wireLibraryPanel();
  wireContentPanel();
  wireSiteContentExtras();
  wireGalleryPanel();
  wireBudgetPanel();
  document.getElementById('budget-txn-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('budget-cat-revenue-group').style.display = 'none';
  initTabs();
  await initLogin();
});
})();
