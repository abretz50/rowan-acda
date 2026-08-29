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
const COMMENTS_URL = '/.netlify/functions/portal-comments';

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
let galleryItems = [];
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
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${d.getFullYear()}`;
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
    : 'E-Board access only. Regular members should sign in at /account.html instead.';
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
  if (canUse('members')) { loadMembers(); loadRecentComments(); }
  if (canUse('points')) { loadPointsPending(); loadPointsAll(); loadAllMembersForSearch(); loadEventDefaults(); }
  if (canUse('library')) loadLibrary();
  if (canUse('content')) loadEboardRoster();
  if (canUse('gallery')) loadGallery();
}

// ── Overview tab ──────────────────────────────────────────
function statCardHTML(number, label, detail) {
  return `<div class="stat-card"><span class="stat-number">${number}</span><span class="stat-label">${escHtml(label)}</span>${detail ? `<span class="stat-detail">${escHtml(detail)}</span>` : ''}</div>`;
}

// Plain inline SVG bar chart — no charting library needed for a handful of
// horizontal bars, and it keeps this dependency-free like the rest of the
// site. Rows: [{label, count}].
function barChartSVG(rows, emptyMsg) {
  if (!rows.length) return `<p class="small muted">${escHtml(emptyMsg || 'No data yet.')}</p>`;
  const max = Math.max(1, ...rows.map(r => r.count));
  const rowH = 26, gap = 6, labelW = 130, barMaxW = 320, chartW = labelW + barMaxW + 50;
  const totalH = rows.length * (rowH + gap);
  const bars = rows.map((r, i) => {
    const y = i * (rowH + gap);
    const w = Math.max(2, (r.count / max) * barMaxW);
    return `<g transform="translate(0,${y})">
      <title>${escHtml(r.label)} — ${r.count}</title>
      <text x="0" y="${rowH / 2}" dominant-baseline="middle" font-size="12" fill="var(--text, #333)">${escHtml(r.label)}</text>
      <rect x="${labelW}" y="4" width="${w}" height="${rowH - 8}" rx="4" fill="var(--brand, #7A0A0A)"></rect>
      <text x="${labelW + w + 6}" y="${rowH / 2}" dominant-baseline="middle" font-size="12" fill="var(--muted, #666)">${r.count}</text>
    </g>`;
  }).join('');
  return `<svg viewBox="0 0 ${chartW} ${totalH}" width="100%" style="max-width:640px;min-width:400px;font-family:inherit">${bars}</svg>`;
}

// For stats where the headline is a name/title, not a count.
function textStatCardHTML(headline, label) {
  return `<div class="stat-card"><span class="stat-number" style="font-size:1.05rem;line-height:1.3">${escHtml(headline)}</span><span class="stat-label">${escHtml(label)}</span></div>`;
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
    statCardHTML(s.tasksCompletedRecently, 'Tasks Completed (2 wks)'),
    textStatCardHTML(s.mostAttendedEvent ? s.mostAttendedEvent.title : 'No events yet', 'Most Attended Event'),
    statCardHTML(s.avgMemberAttendance, 'Avg. Events / Member'),
  ].join('');

  const earnersCard = document.getElementById('overview-top-earners-card');
  const earnersEl = document.getElementById('overview-top-earners');
  if (s.topEarners.length) {
    earnersCard.style.display = '';
    earnersEl.innerHTML = s.topEarners.map((e, i) => `<div class="admin-row">
      <div><span class="name">${i + 1}. ${escHtml(e.name)}</span></div>
      <div class="actions"><span class="badge-role eboard">${e.total} pt${e.total !== 1 ? 's' : ''}</span></div>
    </div>`).join('');
  } else {
    earnersCard.style.display = 'none';
  }

  document.getElementById('overview-attendance-chart').innerHTML = barChartSVG(s.attendanceOverTime, 'No attendance yet.');
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
  // Defensive fallback for any stray role value that isn't in ROLE_LABELS
  // (shouldn't happen going forward, but keeps the dropdown from silently
  // jumping to a different role if it ever does).
  const isUnknownRole = a.role !== 'eboard_legacy' && !Object.prototype.hasOwnProperty.call(ROLE_LABELS, a.role);
  const options = Object.entries(ROLE_LABELS).filter(([k]) => k !== 'eboard_legacy')
    .map(([k, label]) => `<option value="${k}" ${a.role === k ? 'selected' : ''}>${label}</option>`).join('')
    + (isUnknownRole ? `<option value="${escHtml(a.role)}" selected>${escHtml(a.role)}</option>` : '');
  return `<div class="admin-row" data-account-id="${escHtml(a.id)}">
    <div>
      <span class="name">${escHtml(a.name)}</span> ${roleBadge}${inactiveBadge}
      <div class="meta">${escHtml(a.email || '')}${isSelf ? ' · you' : ''}</div>
    </div>
    <div class="actions">
      <select class="admin-input" style="width:auto;display:inline-block" data-role-select="${escHtml(a.id)}">
        ${options}
      </select>
      ${!isSelf ? `<button class="btn-sm outline" data-toggle-active="${escHtml(a.id)}" data-next="${a.active === false ? 'true' : 'false'}">${a.active === false ? 'Reactivate' : 'Deactivate'}</button>` : ''}
      ${!isSelf ? `<button class="btn-sm delete" data-remove-account="${escHtml(a.id)}">Revoke access</button>` : ''}
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
  content: 'Site Content', accounts: 'Accounts',
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

// Color-coded by the assignee's role, per feedback — not by priority.
const ROLE_TASK_COLORS = {
  president: '#ec4899', admin: '#ec4899', vice_president: '#8b5cf6',
  secretary: '#14b8a6', treasurer: '#22c55e', event_coordinator: '#eab308',
  media: '#3b82f6', senator: '#f97316', eboard_access: '#9ca3af', eboard_legacy: '#9ca3af',
};
function taskColorFor(role) { return ROLE_TASK_COLORS[role] || '#9ca3af'; }

function taskRowHTML(t) {
  const overdue = t.status === 'open' && t.dueDate && new Date(t.dueDate) < new Date(new Date().toDateString());
  const priorityBadge = `<span class="badge-role ${t.priority === 'high' ? 'inactive' : t.priority === 'medium' ? 'admin' : 'eboard'}">${t.priority}</span>`;
  const isMine = me && t.assignedToId === me.id;
  const color = taskColorFor(t.assignedToRole);
  const roleLabel = ROLE_LABELS[t.assignedToRole] || t.assignedToRole || 'Member';
  const descPreview = t.description && t.description.length > 90 ? t.description.slice(0, 88) + '…' : t.description;
  return `<div>
    <div class="admin-row${t.status === 'done' ? ' task-done' : ''}" style="cursor:pointer;box-shadow:inset 3px 0 0 ${color}" data-task-toggle="${escHtml(t.id)}">
      <div>
        <span class="name">${escHtml(t.title)}</span> ${priorityBadge}${overdue ? ' <span class="badge-role inactive">overdue</span>' : ''}${isMine ? ' <span class="badge-role eboard">mine</span>' : ''}
        <div class="meta">For ${escHtml(t.assignedToName)} (${escHtml(roleLabel)}) · assigned by ${escHtml(t.assignedByName)}${t.dueDate ? ' · due ' + fmtDashDate(t.dueDate) : ''}</div>
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

// ── Recent Comments (shown on the Members tab) ────────────
async function loadRecentComments() {
  const el = document.getElementById('recent-comments-list');
  const { ok, data } = await api(COMMENTS_URL, { method: 'GET' });
  if (!ok) { el.innerHTML = '<p class="small muted">Could not load comments.</p>'; return; }
  el.innerHTML = data.comments.map(c => `<div class="admin-row">
    <div>
      <span class="name">${escHtml(c.memberName)}</span>
      <div class="meta">on "${escHtml(c.eventTitle)}" · ${new Date(c.createdAt).toLocaleDateString()}</div>
      <p class="small" style="margin:.3rem 0 0">${escHtml(c.text)}</p>
    </div>
    <div class="actions"><button class="btn-sm delete" data-delete-comment="${escHtml(c.id)}">Delete</button></div>
  </div>`).join('') || '<p class="small muted">No comments yet.</p>';
}

function wireRecentCommentsPanel() {
  document.getElementById('recent-comments-list').addEventListener('click', async (e) => {
    const delBtn = e.target.closest('[data-delete-comment]');
    if (!delBtn) return;
    if (!confirm('Delete this comment?')) return;
    const { ok, data } = await api(`${COMMENTS_URL}?id=${encodeURIComponent(delBtn.dataset.deleteComment)}`, { method: 'DELETE' });
    if (!ok) { alert(data.error || 'Could not delete comment.'); return; }
    loadRecentComments();
  });
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
  const accountBadge = m.hasAccount ? `<span class="badge-role eboard">has account</span>` : '';
  const selected = m.id === selectedMemberId ? ' admin-row--selected' : '';
  return `<div class="admin-row${selected}" style="cursor:pointer" data-member-id="${escHtml(m.id)}">
    <div>
      <span class="name">${escHtml(m.name)}</span> ${inactiveBadge}${accountBadge}
      <div class="meta">${escHtml(m.email)}</div>
    </div>
    <div class="actions">
      <button class="btn-sm outline" data-view-points="${escHtml(m.id)}">Points history</button>
      <button class="btn-sm outline" data-toggle-member="${escHtml(m.id)}" data-next="${m.active === false ? 'true' : 'false'}">${m.active === false ? 'Reactivate' : 'Deactivate'}</button>
      <button class="btn-sm delete" data-delete-member="${escHtml(m.id)}">Remove</button>
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
  document.getElementById('members-graph-chart').innerHTML = barChartSVG(lastMemberStats?.membershipOverTime || [], 'No membership data yet.');
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
  chartEl.innerHTML = barChartSVG(chartRows, 'No approved points yet.');

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

async function loadMembers() {
  const listEl = document.getElementById('members-list');
  const { ok, data } = await api(MEMBERS_URL, { method: 'GET' });
  if (!ok) { listEl.innerHTML = `<p class="small muted">Could not load members.</p>`; return; }
  allMembers = data.members.sort((a, b) => a.name.localeCompare(b.name));
  listEl.innerHTML = allMembers.map(memberRowHTML).join('') || `<p class="small muted">No members yet — they'll also appear automatically once someone self check-ins to an event.</p>`;
  document.getElementById('members-stats').innerHTML = memberStatsCardsHTML(data.stats);
  lastMemberStats = data.stats;
  if (!selectedMemberId || !allMembers.some(m => m.id === selectedMemberId)) showMembershipGraph();
}

function wireMembersPanel() {
  document.getElementById('members-graph-reset').addEventListener('click', showMembershipGraph);

  document.getElementById('members-list').addEventListener('click', async (e) => {
    const viewBtn = e.target.closest('[data-view-points]');
    if (viewBtn) { selectMemberPoints(viewBtn.dataset.viewPoints); return; }
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
  const decided = p.status !== 'pending' && p.decidedAt
    ? ` · ${p.status === 'approved' ? 'approved' : 'denied'} by ${escHtml(p.decidedByName || 'Unknown')} · ${fmtDashDate(p.decidedAt)}`
    : '';
  return `<div class="admin-row">
    <div>
      <span class="name">${escHtml(p.memberName)}</span>
      <div class="meta">${escHtml(pointsLabel(p))} · ${p.amount} pt${p.amount !== 1 ? 's' : ''} · ${new Date(p.requestedAt).toLocaleDateString()}${decided}</div>
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

async function loadPointsAll() {
  const el = document.getElementById('points-all-list');
  const { ok, data } = await api(POINTS_URL, { method: 'GET' });
  if (!ok) { el.innerHTML = '<p class="small muted">Could not load.</p>'; return; }
  const rows = data.points.slice().sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));
  el.innerHTML = rows.map(allEntryRowHTML).join('') || '<p class="small muted">No points entries yet.</p>';
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

function setManageRowHTML(sess) {
  const count = sess.scoreUrls.length;
  const archiveBtn = sess.archived
    ? `<button class="btn-sm outline" data-unarchive-set="${escHtml(sess.num)}">Unarchive</button>`
    : `<button class="btn-sm outline" data-archive-set="${escHtml(sess.num)}">Archive</button>`;
  const archivedMeta = sess.archived && sess.archivedAt ? ` · archived ${fmtDashDate(sess.archivedAt)}` : '';
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
  <div class="set-manage-panel" id="set-manage-${escHtml(sess.num)}" style="display:none;margin:.4rem 0 .8rem;padding:.6rem;background:var(--surface);border:1px solid var(--border);border-radius:.55rem">
    <div id="set-current-${escHtml(sess.num)}" style="display:flex;flex-direction:column;gap:.25rem;margin-bottom:.5rem"></div>
    <input class="admin-input" type="search" placeholder="Search the library to add a score…" data-set-search="${escHtml(sess.num)}"/>
    <div id="set-search-results-${escHtml(sess.num)}" style="display:none;max-height:200px;overflow-y:auto;margin-top:.4rem;border:1px solid var(--border);border-radius:.5rem"></div>
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
  document.getElementById('sets-archive-list').innerHTML = archived.map(setManageRowHTML).join('') || '<p class="small muted">No archived sets.</p>';
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
      const { ok, data } = await api(LIBRARY_URL, { method: 'POST', body: JSON.stringify({ op: 'setSessionArchived', num: archiveBtn.dataset.archiveSet, archived: true }) });
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

// ── Gallery tab ───────────────────────────────────────────
function galleryItemHTML(g) {
  return `<div class="admin-card" style="padding:.6rem" data-gallery-id="${escHtml(g.id)}">
    <img src="${escHtml(g.url)}" alt="${escHtml(g.caption)}" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:.5rem;margin-bottom:.4rem"/>
    <label style="display:flex;align-items:center;gap:.4rem;font-size:.82rem">
      <input type="checkbox" class="gallery-slideshow-check" ${g.inSlideshow ? 'checked' : ''}/> Slideshow
    </label>
    <div style="display:flex;gap:.3rem;margin-top:.4rem">
      <button class="btn-sm outline" data-move-gallery="up" data-gallery-move-id="${escHtml(g.id)}" title="Move earlier in the rotation">▲</button>
      <button class="btn-sm outline" data-move-gallery="down" data-gallery-move-id="${escHtml(g.id)}" title="Move later in the rotation">▼</button>
      <button class="btn-sm delete" data-delete-gallery="${escHtml(g.id)}" style="flex:1">Delete</button>
    </div>
  </div>`;
}

async function loadGallery() {
  const { ok, data } = await api(GALLERY_URL, { method: 'GET' });
  if (!ok) return;
  galleryItems = (data.gallery || []).sort((a, b) => a.order - b.order);
  document.getElementById('gallery-list').innerHTML = galleryItems.map(galleryItemHTML).join('') || '<p class="small muted">No photos yet.</p>';
}

function wireGalleryPanel() {
  document.getElementById('gallery-upload-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById('gallery-upload-status');
    const file = document.getElementById('gal-file').files[0];
    if (!file) { statusEl.textContent = 'Choose a photo.'; statusEl.className = 'admin-status err'; return; }
    statusEl.textContent = 'Uploading…'; statusEl.className = 'admin-status';
    const up = await uploadFile(file, 'gallery');
    if (!up.ok) { statusEl.textContent = up.data.error || 'Upload failed.'; statusEl.className = 'admin-status err'; return; }
    const caption = document.getElementById('gal-caption').value.trim();
    const { ok, data } = await api(GALLERY_URL, { method: 'POST', body: JSON.stringify({ url: up.data.url, caption }) });
    if (!ok) { statusEl.textContent = data.error || 'Could not save.'; statusEl.className = 'admin-status err'; return; }
    statusEl.textContent = 'Uploaded. It will appear on the site shortly.'; statusEl.className = 'admin-status ok';
    e.target.reset();
    loadGallery();
  });

  document.getElementById('gallery-list').addEventListener('change', async (e) => {
    if (!e.target.classList.contains('gallery-slideshow-check')) return;
    const id = e.target.closest('[data-gallery-id]').dataset.galleryId;
    const { ok, data } = await api(GALLERY_URL, { method: 'PATCH', body: JSON.stringify({ id, inSlideshow: e.target.checked }) });
    if (!ok) { alert(data.error || 'Could not update.'); e.target.checked = !e.target.checked; }
  });

  document.getElementById('gallery-list').addEventListener('click', async (e) => {
    const moveBtn = e.target.closest('[data-move-gallery]');
    if (moveBtn) {
      const id = moveBtn.dataset.galleryMoveId;
      const idx = galleryItems.findIndex(g => g.id === id);
      const swapWith = moveBtn.dataset.moveGallery === 'up' ? idx - 1 : idx + 1;
      if (idx === -1 || swapWith < 0 || swapWith >= galleryItems.length) return;
      const reordered = [...galleryItems];
      [reordered[idx], reordered[swapWith]] = [reordered[swapWith], reordered[idx]];
      const { ok, data } = await api(GALLERY_URL, { method: 'POST', body: JSON.stringify({ op: 'reorder', ids: reordered.map(g => g.id) }) });
      if (!ok) { alert(data.error || 'Could not reorder.'); return; }
      loadGallery();
      return;
    }
    const delBtn = e.target.closest('[data-delete-gallery]');
    if (!delBtn) return;
    if (!confirm('Delete this photo? This removes it from the site (the file stays in GitHub history).')) return;
    const { ok, data } = await api(`${GALLERY_URL}?id=${encodeURIComponent(delBtn.dataset.deleteGallery)}`, { method: 'DELETE' });
    if (!ok) { alert(data.error || 'Could not delete.'); return; }
    loadGallery();
  });
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
  wireGalleryPanel();
  initTabs();
  await initLogin();
});
})();
