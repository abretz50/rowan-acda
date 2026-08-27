/* ============================================================
   E-Board Portal — js/portal.js
   Auth, Events + self-checkin attendance, Members, the Digital
   Library, Site Content (E-Board roster), and Gallery/slideshow.
   ============================================================ */
(() => {
'use strict';

const AUTH_URL       = '/.netlify/functions/portal-auth';
const USERS_URL      = '/.netlify/functions/portal-users';
const EVENTS_URL     = '/.netlify/functions/portal-events';
const MEMBERS_URL    = '/.netlify/functions/portal-members';
const ATTENDANCE_URL = '/.netlify/functions/portal-attendance';
const LIBRARY_URL    = '/.netlify/functions/portal-library';
const CONTENT_URL    = '/.netlify/functions/portal-content';
const GALLERY_URL    = '/.netlify/functions/portal-gallery';
const UPLOAD_URL     = '/.netlify/functions/portal-upload';

let me = null;
let needsBootstrap = false;
let allEvents = [];
let editingEventId = null;
let libScores = [];
let libSessions = [];
let editingScoreUrl = null;
let eboardRoster = [];
let editingEboardId = null;
let galleryItems = [];
const KNOWN_VOICINGS = ['','SATB','SATB divisi','SAB','SSA','SSAA','TTBB','2-Part','Unison','Other'];
const KNOWN_INSTRS   = ['','A Cappella','Piano','Organ','Guitar','Orchestra','Chamber Ensemble','Strings','Band','Brass','Other'];

function toISOFromLocalInput(v){ return v ? new Date(v).toISOString() : ''; }
function toLocalInputFromISO(iso){
  if(!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
  document.getElementById('login-heading').textContent = on ? 'Set up the first admin account' : 'Sign in';
  document.getElementById('login-subtext').textContent = on
    ? 'No portal accounts exist yet. Create the first admin using the setup secret from whoever deployed the site.'
    : 'E-Board access only.';
  document.getElementById('login-submit').textContent = on ? 'Create admin account' : 'Sign in';
}

async function initLogin() {
  const { data } = await api(AUTH_URL, { method: 'GET' });
  if (data.ok) {
    me = data.user;
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
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    if (needsBootstrap) {
      const name = document.getElementById('login-name').value.trim();
      const secret = document.getElementById('login-secret').value;
      const { ok, data } = await api(AUTH_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'bootstrap', secret, name, username, password }),
      });
      if (!ok) { errEl.textContent = data.error || 'Setup failed.'; return; }
      me = data.user; needsBootstrap = false; showDashboard();
      return;
    }

    const { ok, data } = await api(AUTH_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'login', username, password }),
    });
    if (!ok) { errEl.textContent = data.error || 'Sign-in failed.'; return; }
    me = data.user; showDashboard();
  });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await api(AUTH_URL, { method: 'POST', body: JSON.stringify({ action: 'logout' }) });
    me = null;
    document.getElementById('dashboard-section').style.display = 'none';
    document.getElementById('login-section').style.display = '';
    document.getElementById('login-form').reset();
  });
}

// ── Dashboard shell ───────────────────────────────────────
function showDashboard() {
  document.getElementById('login-section').style.display = 'none';
  document.getElementById('dashboard-section').style.display = '';
  document.getElementById('whoami').textContent = `Signed in as ${me.name} (${me.role})`;
  if (me.role === 'admin') {
    document.getElementById('tab-users').style.display = '';
    loadUsers();
  }
  loadEvents();
  loadMembers();
  loadAttendanceSummary();
  loadLibrary();
  loadEboardRoster();
  loadGallery();
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

// ── Users tab ─────────────────────────────────────────────
function userRowHTML(u) {
  const roleBadge = `<span class="badge-role ${u.role}">${u.role}</span>`;
  const inactiveBadge = u.active ? '' : `<span class="badge-role inactive">inactive</span>`;
  const isSelf = me && u.id === me.id;
  const canManage = me && me.role === 'admin';
  return `<div class="admin-row" data-user-id="${escHtml(u.id)}">
    <div>
      <span class="name">${escHtml(u.name)}</span> ${roleBadge}${inactiveBadge}
      <div class="meta">@${escHtml(u.username)}${isSelf ? ' · you' : ''}</div>
    </div>
    <div class="actions">
      ${canManage && !isSelf ? `<button class="btn-sm outline" data-toggle-active="${escHtml(u.id)}" data-next="${u.active ? 'false' : 'true'}">${u.active ? 'Deactivate' : 'Reactivate'}</button>` : ''}
      ${canManage && !isSelf ? `<button class="btn-sm delete" data-remove-user="${escHtml(u.id)}">Remove</button>` : ''}
    </div>
  </div>`;
}

async function loadUsers() {
  const listEl = document.getElementById('users-list');
  const { ok, data } = await api(USERS_URL, { method: 'GET' });
  if (!ok) { listEl.innerHTML = `<p class="small muted">Could not load users.</p>`; return; }
  listEl.innerHTML = data.users.map(userRowHTML).join('') || `<p class="small muted">No users yet.</p>`;
}

function wireUsersPanel() {
  document.getElementById('add-user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById('add-user-status');
    const name = document.getElementById('nu-name').value.trim();
    const username = document.getElementById('nu-username').value.trim();
    const password = document.getElementById('nu-password').value;
    const role = document.getElementById('nu-role').value;
    if (!name || !username || !password) {
      statusEl.textContent = 'Name, username, and password are required.'; statusEl.className = 'admin-status err'; return;
    }
    const { ok, data } = await api(USERS_URL, { method: 'POST', body: JSON.stringify({ name, username, password, role }) });
    if (!ok) { statusEl.textContent = data.error || 'Could not create user.'; statusEl.className = 'admin-status err'; return; }
    statusEl.textContent = 'User created.'; statusEl.className = 'admin-status ok';
    e.target.reset();
    loadUsers();
  });

  document.getElementById('users-list').addEventListener('click', async (e) => {
    const toggleBtn = e.target.closest('[data-toggle-active]');
    if (toggleBtn) {
      const id = toggleBtn.dataset.toggleActive;
      const next = toggleBtn.dataset.next === 'true';
      const { ok, data } = await api(USERS_URL, { method: 'PATCH', body: JSON.stringify({ id, active: next }) });
      if (!ok) { alert(data.error || 'Could not update user.'); return; }
      loadUsers();
      return;
    }
    const removeBtn = e.target.closest('[data-remove-user]');
    if (removeBtn) {
      const id = removeBtn.dataset.removeUser;
      if (!confirm('Remove this user? They will immediately lose portal access.')) return;
      const { ok, data } = await api(`${USERS_URL}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!ok) { alert(data.error || 'Could not remove user.'); return; }
      loadUsers();
    }
  });
}

// ── Events tab ────────────────────────────────────────────
function eventRowHTML(ev) {
  const link = `${location.origin}/checkin.html?code=${encodeURIComponent(ev.checkinCode)}`;
  return `<div class="admin-row" style="align-items:flex-start" data-event-id="${escHtml(ev.id)}">
    <div>
      <span class="name">${escHtml(ev.title)}</span>
      <div class="meta">${escHtml(fmtDateRange(ev.start, ev.end))}${ev.location ? ' · ' + escHtml(ev.location) : ''}</div>
      <div class="meta" style="margin-top:.3rem">Check-in code: <strong style="letter-spacing:.08em">${escHtml(ev.checkinCode)}</strong></div>
    </div>
    <div class="actions">
      <button class="btn-sm outline" data-copy-link="${escHtml(link)}">Copy check-in link</button>
      <button class="btn-sm outline" data-regen-code="${escHtml(ev.id)}">New code</button>
      <button class="btn-sm edit" data-edit-event="${escHtml(ev.id)}">Edit</button>
      <button class="btn-sm delete" data-delete-event="${escHtml(ev.id)}">Delete</button>
    </div>
  </div>`;
}

async function loadEvents() {
  const listEl = document.getElementById('events-list');
  const { ok, data } = await api(EVENTS_URL, { method: 'GET' });
  if (!ok) { listEl.innerHTML = `<p class="small muted">Could not load events.</p>`; return; }
  allEvents = data.events.sort((a, b) => new Date(b.start) - new Date(a.start));
  listEl.innerHTML = allEvents.map(eventRowHTML).join('') || `<p class="small muted">No events yet.</p>`;
  populateEventSelect();
}

function resetEventForm() {
  editingEventId = null;
  document.getElementById('event-form').reset();
  document.getElementById('event-form-heading').textContent = 'Create Event';
  document.getElementById('event-form-submit').textContent = 'Create event';
  document.getElementById('event-form-cancel').style.display = 'none';
}

function wireEventsPanel() {
  document.getElementById('event-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById('event-form-status');
    const payload = {
      title: document.getElementById('ev-title').value.trim(),
      description: document.getElementById('ev-desc').value.trim(),
      start: toISOFromLocalInput(document.getElementById('ev-start').value),
      end: toISOFromLocalInput(document.getElementById('ev-end').value),
      location: document.getElementById('ev-location').value.trim(),
      tags: document.getElementById('ev-tags').value.split(',').map(t => t.trim()).filter(Boolean),
      signinLink: document.getElementById('ev-signin').value.trim(),
      imageUrl: document.getElementById('ev-image').value.trim(),
    };
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

  document.getElementById('import-sheet-btn').addEventListener('click', async () => {
    const statusEl = document.getElementById('import-sheet-status');
    if (!confirm('Import all events from the retired Google Sheet? Events already in the portal (matched by title + start time) are skipped, so this is safe to run more than once.')) return;
    statusEl.textContent = 'Importing…'; statusEl.className = 'admin-status';
    const { ok, data } = await api(EVENTS_URL, { method: 'POST', body: JSON.stringify({ op: 'importFromSheet' }) });
    if (!ok) { statusEl.textContent = data.error || 'Import failed.'; statusEl.className = 'admin-status err'; return; }
    statusEl.textContent = `Imported ${data.added} event${data.added !== 1 ? 's' : ''}${data.skipped ? ` (${data.skipped} already existed)` : ''}.`;
    statusEl.className = 'admin-status ok';
    loadEvents();
  });

  document.getElementById('events-list').addEventListener('click', async (e) => {
    const copyBtn = e.target.closest('[data-copy-link]');
    if (copyBtn) {
      try { await navigator.clipboard.writeText(copyBtn.dataset.copyLink); copyBtn.textContent = 'Copied!'; setTimeout(() => copyBtn.textContent = 'Copy check-in link', 1500); }
      catch { prompt('Copy this link:', copyBtn.dataset.copyLink); }
      return;
    }
    const regenBtn = e.target.closest('[data-regen-code]');
    if (regenBtn) {
      if (!confirm('Generate a new check-in code? The old code/link will stop working.')) return;
      const { ok, data } = await api(EVENTS_URL, { method: 'PATCH', body: JSON.stringify({ id: regenBtn.dataset.regenCode, regenerateCode: true }) });
      if (!ok) { alert(data.error || 'Could not regenerate code.'); return; }
      loadEvents();
      return;
    }
    const editBtn = e.target.closest('[data-edit-event]');
    if (editBtn) {
      const ev = allEvents.find(x => x.id === editBtn.dataset.editEvent);
      if (!ev) return;
      editingEventId = ev.id;
      document.getElementById('ev-title').value = ev.title;
      document.getElementById('ev-desc').value = ev.description || '';
      document.getElementById('ev-start').value = toLocalInputFromISO(ev.start);
      document.getElementById('ev-end').value = toLocalInputFromISO(ev.end);
      document.getElementById('ev-location').value = ev.location || '';
      document.getElementById('ev-tags').value = (ev.tags || []).join(', ');
      document.getElementById('ev-signin').value = ev.signinLink || '';
      document.getElementById('ev-image').value = ev.imageUrl || '';
      document.getElementById('event-form-heading').textContent = 'Edit Event';
      document.getElementById('event-form-submit').textContent = 'Save changes';
      document.getElementById('event-form-cancel').style.display = '';
      document.getElementById('ev-title').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const delBtn = e.target.closest('[data-delete-event]');
    if (delBtn) {
      if (!confirm('Delete this event? Its attendance history is kept, but the check-in link will stop working.')) return;
      const { ok, data } = await api(`${EVENTS_URL}?id=${encodeURIComponent(delBtn.dataset.deleteEvent)}`, { method: 'DELETE' });
      if (!ok) { alert(data.error || 'Could not delete event.'); return; }
      loadEvents();
    }
  });
}

// ── Members tab ───────────────────────────────────────────
function memberRowHTML(m) {
  const inactiveBadge = m.active === false ? `<span class="badge-role inactive">inactive</span>` : '';
  return `<div class="admin-row" data-member-id="${escHtml(m.id)}">
    <div>
      <span class="name">${escHtml(m.name)}</span> ${inactiveBadge}
      <div class="meta">${escHtml(m.email)}${m.year ? ' · ' + escHtml(m.year) : ''}${m.voicePart ? ' · ' + escHtml(m.voicePart) : ''}</div>
    </div>
    <div class="actions">
      <button class="btn-sm outline" data-toggle-member="${escHtml(m.id)}" data-next="${m.active === false ? 'true' : 'false'}">${m.active === false ? 'Reactivate' : 'Deactivate'}</button>
      <button class="btn-sm delete" data-delete-member="${escHtml(m.id)}">Remove</button>
    </div>
  </div>`;
}

async function loadMembers() {
  const listEl = document.getElementById('members-list');
  const { ok, data } = await api(MEMBERS_URL, { method: 'GET' });
  if (!ok) { listEl.innerHTML = `<p class="small muted">Could not load members.</p>`; return; }
  const members = data.members.sort((a, b) => a.name.localeCompare(b.name));
  listEl.innerHTML = members.map(memberRowHTML).join('') || `<p class="small muted">No members yet — they'll also appear automatically once someone self check-ins to an event.</p>`;
}

function wireMembersPanel() {
  document.getElementById('member-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById('member-form-status');
    const name = document.getElementById('mb-name').value.trim();
    const email = document.getElementById('mb-email').value.trim();
    const year = document.getElementById('mb-year').value.trim();
    const voicePart = document.getElementById('mb-voice').value.trim();
    if (!name || !email) { statusEl.textContent = 'Name and email are required.'; statusEl.className = 'admin-status err'; return; }
    const { ok, data } = await api(MEMBERS_URL, { method: 'POST', body: JSON.stringify({ name, email, year, voicePart }) });
    if (!ok) { statusEl.textContent = data.error || 'Could not add member.'; statusEl.className = 'admin-status err'; return; }
    statusEl.textContent = 'Member added.'; statusEl.className = 'admin-status ok';
    e.target.reset();
    loadMembers();
  });

  document.getElementById('members-list').addEventListener('click', async (e) => {
    const toggleBtn = e.target.closest('[data-toggle-member]');
    if (toggleBtn) {
      const { ok, data } = await api(MEMBERS_URL, { method: 'PATCH', body: JSON.stringify({ id: toggleBtn.dataset.toggleMember, active: toggleBtn.dataset.next === 'true' }) });
      if (!ok) { alert(data.error || 'Could not update member.'); return; }
      loadMembers();
      return;
    }
    const delBtn = e.target.closest('[data-delete-member]');
    if (delBtn) {
      if (!confirm('Remove this member? Their past attendance history is kept.')) return;
      const { ok, data } = await api(`${MEMBERS_URL}?id=${encodeURIComponent(delBtn.dataset.deleteMember)}`, { method: 'DELETE' });
      if (!ok) { alert(data.error || 'Could not remove member.'); return; }
      loadMembers();
    }
  });
}

// ── Attendance tab ────────────────────────────────────────
function populateEventSelect() {
  const sel = document.getElementById('att-event-select');
  const current = sel.value;
  sel.innerHTML = '<option value="">Choose an event…</option>' +
    allEvents.map(ev => `<option value="${escHtml(ev.id)}">${escHtml(ev.title)} — ${escHtml(fmtDateRange(ev.start, ev.end))}</option>`).join('');
  if (current) sel.value = current;
}

function attendanceRowHTML(a) {
  return `<div class="admin-row" data-att-id="${escHtml(a.id)}">
    <div>
      <span class="name">${escHtml(a.name)}</span>
      <div class="meta">${escHtml(a.email)} · checked in ${new Date(a.checkedInAt).toLocaleString()}</div>
    </div>
    <div class="actions"><button class="btn-sm delete" data-remove-att="${escHtml(a.id)}">Remove</button></div>
  </div>`;
}

async function loadEventAttendance(eventId) {
  const detailEl = document.getElementById('att-event-detail');
  const exportLink = document.getElementById('att-export-event');
  if (!eventId) { detailEl.innerHTML = ''; exportLink.style.display = 'none'; return; }
  exportLink.href = `${ATTENDANCE_URL}?eventId=${encodeURIComponent(eventId)}&csv=1`;
  exportLink.style.display = '';
  const { ok, data } = await api(`${ATTENDANCE_URL}?eventId=${encodeURIComponent(eventId)}`, { method: 'GET' });
  if (!ok) { detailEl.innerHTML = `<p class="small muted">Could not load attendance.</p>`; return; }
  detailEl.innerHTML = `
    <form class="admin-form" id="manual-att-form" style="margin-bottom:.75rem">
      <div class="form-row">
        <input class="admin-input" type="text" id="ma-name" placeholder="Full name"/>
        <input class="admin-input" type="email" id="ma-email" placeholder="Email"/>
      </div>
      <button class="btn-sm" type="submit">Mark present</button>
      <div class="admin-status" id="manual-att-status"></div>
    </form>
    ${data.attendance.map(attendanceRowHTML).join('') || '<p class="small muted">No check-ins yet for this event.</p>'}
  `;
  document.getElementById('manual-att-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById('manual-att-status');
    const name = document.getElementById('ma-name').value.trim();
    const email = document.getElementById('ma-email').value.trim();
    if (!name || !email) { statusEl.textContent = 'Name and email are required.'; statusEl.className = 'admin-status err'; return; }
    const { ok, data: res } = await api(ATTENDANCE_URL, { method: 'POST', body: JSON.stringify({ eventId, name, email }) });
    if (!ok) { statusEl.textContent = res.error || 'Could not add.'; statusEl.className = 'admin-status err'; return; }
    loadEventAttendance(eventId);
    loadAttendanceSummary();
  });
}

async function loadAttendanceSummary() {
  const el = document.getElementById('att-summary');
  const { ok, data } = await api(`${ATTENDANCE_URL}?summary=1`, { method: 'GET' });
  if (!ok) { el.innerHTML = `<p class="small muted">Could not load totals.</p>`; return; }
  if (!data.summary.length) { el.innerHTML = `<p class="small muted">No attendance recorded yet.</p>`; return; }
  el.innerHTML = data.summary.map(s => `<div class="admin-row">
    <div><span class="name">${escHtml(s.name)}</span><div class="meta">${escHtml(s.email)}</div></div>
    <div class="actions"><span class="badge-role eboard">${s.count} event${s.count !== 1 ? 's' : ''}</span></div>
  </div>`).join('');
}

function wireAttendancePanel() {
  document.getElementById('att-event-select').addEventListener('change', (e) => loadEventAttendance(e.target.value));
  document.getElementById('att-event-detail').addEventListener('click', async (e) => {
    const removeBtn = e.target.closest('[data-remove-att]');
    if (!removeBtn) return;
    if (!confirm('Remove this attendance record?')) return;
    const { ok, data } = await api(`${ATTENDANCE_URL}?id=${encodeURIComponent(removeBtn.dataset.removeAtt)}`, { method: 'DELETE' });
    if (!ok) { alert(data.error || 'Could not remove record.'); return; }
    loadEventAttendance(document.getElementById('att-event-select').value);
    loadAttendanceSummary();
  });
}

// ── Digital Library tab ───────────────────────────────────
function composerDisplay(s){ return [s.composer_first, s.composer_last].filter(Boolean).join(' '); }

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
  const composer = composerDisplay(s);
  const meta = [s.voicing, s.instrumentation, s.year].filter(Boolean).join(' · ');
  return `<div class="admin-row" data-score-url="${escHtml(s.url)}">
    <div>
      <span class="name">${escHtml(s.title)}</span>
      <div class="meta">${escHtml(composer)}${composer && meta ? ' · ' : ''}${escHtml(meta)}</div>
    </div>
    <div class="actions">
      <button class="btn-sm edit" data-edit-score="${escHtml(s.url)}">Edit</button>
      <button class="btn-sm delete" data-delete-score="${escHtml(s.url)}">Delete</button>
    </div>
  </div>`;
}

function renderLibManageList() {
  const el = document.getElementById('lib-manage-list');
  const term = (document.getElementById('lib-manage-search').value || '').toLowerCase();
  const filtered = libScores.filter(s => !term || s.title.toLowerCase().includes(term) || composerDisplay(s).toLowerCase().includes(term));
  el.innerHTML = filtered.map(scoreManageRowHTML).join('') || '<p class="small muted">No scores yet.</p>';
}

function setManageRowHTML(sess) {
  const count = sess.scoreUrls.length;
  return `<div class="admin-row" style="align-items:flex-start" data-set-num="${escHtml(sess.num)}">
    <div>
      <span class="name">${escHtml(sess.num)}: ${escHtml(sess.name)}</span>
      <div class="meta">${count} score${count !== 1 ? 's' : ''}</div>
    </div>
    <div class="actions">
      <button class="btn-sm outline" data-manage-set="${escHtml(sess.num)}">Manage scores</button>
      <button class="btn-sm delete" data-delete-set="${escHtml(sess.num)}">Delete</button>
    </div>
  </div>
  <div class="set-manage-panel" id="set-manage-${escHtml(sess.num)}" style="display:none;margin:.4rem 0 .8rem;padding:.6rem;background:var(--surface);border:1px solid var(--border);border-radius:.55rem">
    <div style="max-height:220px;overflow-y:auto;display:flex;flex-direction:column;gap:.25rem">
      ${libScores.map(s => `<label style="display:flex;gap:.4rem;align-items:center;font-size:.85rem">
        <input type="checkbox" class="set-score-check" value="${escHtml(s.url)}" ${sess.scoreUrls.includes(s.url) ? 'checked' : ''}/>
        ${escHtml(s.title)}${composerDisplay(s) ? ' — ' + escHtml(composerDisplay(s)) : ''}
      </label>`).join('') || '<p class="small muted">No scores in the library yet.</p>'}
    </div>
    <button class="btn-sm" data-save-set-scores="${escHtml(sess.num)}" style="margin-top:.5rem">Save</button>
  </div>`;
}
function renderSetsManageList() {
  document.getElementById('sets-manage-list').innerHTML = libSessions.map(setManageRowHTML).join('') || '<p class="small muted">No sets yet.</p>';
}

async function loadLibrary() {
  const { ok, data } = await api(LIBRARY_URL, { method: 'GET' });
  if (!ok) return;
  libScores = data.scores || [];
  libSessions = data.sessions || [];
  renderLibManageList();
  renderSetsManageList();
}

function resetScoreForm() {
  editingScoreUrl = null;
  document.getElementById('score-form').reset();
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
    const score = {
      title: document.getElementById('sc-title').value.trim(),
      url: document.getElementById('sc-url').value.trim(),
      composer_first: document.getElementById('sc-cfirst').value.trim(),
      composer_last: document.getElementById('sc-clast').value.trim(),
      year: document.getElementById('sc-year').value.trim(),
      voicing: getSelectOrOther('sc-voicing', 'sc-voicing-other'),
      instrumentation: getSelectOrOther('sc-instr', 'sc-instr-other'),
      tags: Array.from(document.getElementById('sc-tags').selectedOptions).map(o => o.value),
    };
    if (!score.title || !score.url) { statusEl.textContent = 'Title and PDF path are required.'; statusEl.className = 'admin-status err'; return; }

    const { ok, data } = editingScoreUrl
      ? await api(LIBRARY_URL, { method: 'POST', body: JSON.stringify({ op: 'updateScore', oldUrl: editingScoreUrl, score }) })
      : await api(LIBRARY_URL, { method: 'POST', body: JSON.stringify({ op: 'addScore', score }) });
    if (!ok) { statusEl.textContent = data.error || 'Could not save score.'; statusEl.className = 'admin-status err'; return; }
    statusEl.textContent = 'Saved.'; statusEl.className = 'admin-status ok';
    libScores = data.scores; libSessions = data.sessions;
    resetScoreForm();
    renderLibManageList(); renderSetsManageList();
  });
  document.getElementById('score-form-cancel').addEventListener('click', resetScoreForm);
  document.getElementById('lib-manage-search').addEventListener('input', renderLibManageList);

  document.getElementById('lib-manage-list').addEventListener('click', async (e) => {
    const editBtn = e.target.closest('[data-edit-score]');
    if (editBtn) {
      const s = libScores.find(x => x.url === editBtn.dataset.editScore);
      if (!s) return;
      editingScoreUrl = s.url;
      document.getElementById('sc-title').value = s.title;
      document.getElementById('sc-cfirst').value = s.composer_first;
      document.getElementById('sc-clast').value = s.composer_last;
      document.getElementById('sc-year').value = s.year;
      setSelectOrOther('sc-voicing', 'sc-voicing-other', s.voicing, KNOWN_VOICINGS);
      setSelectOrOther('sc-instr', 'sc-instr-other', s.instrumentation, KNOWN_INSTRS);
      document.getElementById('sc-url').value = s.url;
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
      renderLibManageList(); renderSetsManageList();
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

  document.getElementById('sets-manage-list').addEventListener('click', async (e) => {
    const manageBtn = e.target.closest('[data-manage-set]');
    if (manageBtn) {
      const panel = document.getElementById(`set-manage-${manageBtn.dataset.manageSet}`);
      if (panel) panel.style.display = panel.style.display === 'none' ? '' : 'none';
      return;
    }
    const saveBtn = e.target.closest('[data-save-set-scores]');
    if (saveBtn) {
      const num = saveBtn.dataset.saveSetScores;
      const panel = document.getElementById(`set-manage-${num}`);
      const urls = Array.from(panel.querySelectorAll('.set-score-check:checked')).map(c => c.value);
      const { ok, data } = await api(LIBRARY_URL, { method: 'POST', body: JSON.stringify({ op: 'setSessionScores', num, urls }) });
      if (!ok) { alert(data.error || 'Could not save.'); return; }
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
  });
}

// ── Site Content (E-Board roster) tab ─────────────────────
function eboardRowHTML(p) {
  return `<div class="admin-row" data-eb-id="${escHtml(p.id)}">
    <div>
      <span class="name">${escHtml(p.name)}</span>
      <div class="meta">${escHtml(p.role)}${p.email ? ' · ' + escHtml(p.email) : ''}</div>
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
  document.getElementById('eb-form-heading').textContent = 'Add E-Board Member';
  document.getElementById('eb-form-submit').textContent = 'Add member';
  document.getElementById('eb-form-cancel').style.display = 'none';
}

function wireContentPanel() {
  document.getElementById('eb-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById('eb-form-status');
    const name = document.getElementById('eb-name').value.trim();
    const role = document.getElementById('eb-role').value.trim();
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
      document.getElementById('eb-role').value = p.role;
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
    <button class="btn-sm delete" data-delete-gallery="${escHtml(g.id)}" style="margin-top:.4rem;width:100%">Delete</button>
  </div>`;
}

async function loadGallery() {
  const { ok, data } = await api(GALLERY_URL, { method: 'GET' });
  if (!ok) return;
  galleryItems = data.gallery || [];
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
  wireUsersPanel();
  wireEventsPanel();
  wireMembersPanel();
  wireAttendancePanel();
  wireLibraryPanel();
  wireContentPanel();
  wireGalleryPanel();
  initTabs();
  await initLogin();
});
})();
