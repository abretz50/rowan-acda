/* ============================================================
   My Account — js/account.js
   Sign in / self-registration / profile / authenticated check-in.
   ============================================================ */
(() => {
'use strict';

const AUTH_URL   = '/.netlify/functions/portal-auth';
const ME_URL     = '/.netlify/functions/portal-me';
const POINTS_URL = '/.netlify/functions/portal-points';
const EVENTS_URL = '/.netlify/functions/portal-events';

// Any role other than plain 'member' counts as E-Board for this page's
// purposes — including a custom "Other" role created from the portal's
// Accounts tab, which starts with baseline access but is still an E-Board
// account, not a checking-in club member.
function isEboardRole(role) { return role && role !== 'member'; }

let me = null;
let myCheckedInEventIds = new Set();
let checkinRefreshTimer = null;

function escHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtDashDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${d.getFullYear()}`;
}
// Volunteer entries carry both an eventTitle and a more specific reason
// (which slot, "brought food", etc.) — show both instead of just the event
// name repeated.
function pointsLabel(p) {
  if (p.eventTitle && p.reason && p.reason !== p.eventTitle) return `${p.eventTitle} — ${p.reason}`;
  return p.eventTitle || p.reason || '';
}

async function api(url, opts = {}) {
  const res = await fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts });
  let data = {};
  try { data = await res.json(); } catch {}
  return { ok: res.ok && data.ok !== false, data };
}

function showSignedOut() {
  document.getElementById('signed-out').style.display = '';
  document.getElementById('signed-in').style.display = 'none';
}

function fillProfileView() {
  document.getElementById('view-name').textContent = me.name || '—';
  document.getElementById('view-email').textContent = me.email || '—';
  const img = document.getElementById('profile-photo-preview');
  const placeholder = document.getElementById('profile-photo-placeholder');
  if (me.photoUrl) {
    img.src = me.photoUrl; img.style.display = '';
    placeholder.style.display = 'none';
  } else {
    img.style.display = 'none';
    placeholder.style.display = '';
  }
}

async function uploadFile(file, category) {
  const form = new FormData();
  form.append('file', file);
  form.append('category', category);
  const res = await fetch('/.netlify/functions/portal-upload', { method: 'POST', credentials: 'include', body: form });
  let data = {};
  try { data = await res.json(); } catch {}
  return { ok: res.ok && data.ok !== false, data };
}

function showSignedIn() {
  document.getElementById('signed-out').style.display = 'none';
  document.getElementById('signed-in').style.display = '';
  document.getElementById('whoami').textContent = `Signed in as ${me.name}`;
  document.getElementById('portal-link').style.display = isEboardRole(me.role) ? '' : 'none';
  document.getElementById('checkin-card').style.display = isEboardRole(me.role) ? 'none' : '';
  fillProfileView();
  document.getElementById('pf-name').value = me.name || '';
  document.getElementById('pf-email').value = me.email || '';
  loadLeaderboard();
  const historyLoaded = loadEventsHistory();
  if (!isEboardRole(me.role)) {
    historyLoaded.then(loadCheckinEvents);
    clearInterval(checkinRefreshTimer);
    checkinRefreshTimer = setInterval(loadCheckinEvents, 60 * 1000);
  }
}

async function loadEventsHistory() {
  const { ok, data } = await api(`${POINTS_URL}?mine=1`, { method: 'GET' });
  const listEl = document.getElementById('events-history-list');
  if (!ok) { listEl.innerHTML = '<p class="small muted">Could not load.</p>'; return; }
  myCheckedInEventIds = new Set(data.points.filter(p => p.status !== 'denied').map(p => p.eventId).filter(Boolean));
  listEl.innerHTML = data.points
    .slice().sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt))
    .map(p => {
      const decided = p.status !== 'pending' && p.decidedAt
        ? ` · ${p.status === 'approved' ? 'approved' : 'denied'} by ${escHtml(p.decidedByName || 'Unknown')} · ${fmtDashDate(p.decidedAt)}`
        : '';
      return `<div class="admin-row">
      <div>
        <span class="name">${escHtml(pointsLabel(p) || 'Event')}</span>
        <div class="meta">${new Date(p.requestedAt).toLocaleDateString()}${decided}</div>
      </div>
      <div class="actions"><span class="badge-role ${p.status === 'approved' ? 'eboard' : p.status === 'denied' ? 'inactive' : 'admin'}">${p.status === 'pending' ? 'pending review' : p.status}</span></div>
    </div>`;
    }).join('') || '<p class="small muted">No Events yet, see the events page to attend your first event!</p>';
}

// ── Points leaderboard: rank + name/photo only, never point totals ──────
function leaderboardRowHTML(entry) {
  const avatar = entry.photoUrl
    ? `<img src="${escHtml(entry.photoUrl)}" alt="" style="width:32px;height:32px;border-radius:50%;object-fit:cover;border:1px solid var(--border)"/>`
    : `<div style="width:32px;height:32px;border-radius:50%;background:var(--surface);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:.9rem;color:var(--muted)">👤</div>`;
  return `<div class="admin-row"${entry.isMe ? ' style="background:var(--surface)"' : ''}>
    <div style="display:flex;align-items:center;gap:.6rem">
      <span class="name" style="min-width:2rem">#${entry.rank}</span>
      ${avatar}
      <span>${escHtml(entry.name)}${entry.isMe ? ' <span class="badge-role eboard">you</span>' : ''}</span>
    </div>
  </div>`;
}

async function loadLeaderboard() {
  const listEl = document.getElementById('leaderboard-list');
  const standingEl = document.getElementById('leaderboard-standing');
  const { ok, data } = await api(`${ME_URL}?leaderboard=1`, { method: 'GET' });
  if (!ok || !data.entries) {
    listEl.innerHTML = '<p class="small muted">Could not load leaderboard.</p>';
    standingEl.textContent = '';
    return;
  }
  standingEl.textContent = data.myRank ? `Current Standing: #${data.myRank}/${data.totalMembers}` : '';
  listEl.innerHTML = data.entries.map(leaderboardRowHTML).join('') || '<p class="small muted">Not enough data yet.</p>';
}

// ── Check into an event (no code — just events open right now) ──────────
async function loadCheckinEvents() {
  const listEl = document.getElementById('checkin-events-list');
  const { ok, data } = await api(EVENTS_URL, { method: 'GET' });
  if (!ok) { listEl.innerHTML = '<p class="small muted">Could not load events.</p>'; return; }
  // Volunteer events don't use check-in at all — they're signed up for on
  // the Events page instead (slots / bring food / full-event signup).
  const open = (data.events || []).filter(ev => ev.checkinOpen && !(ev.tags || []).includes('Volunteer'));
  listEl.innerHTML = open.map(ev => {
    const already = myCheckedInEventIds.has(ev.id);
    return `<div class="admin-row">
      <div><span class="name">${escHtml(ev.title)}</span></div>
      <div class="actions">${already
        ? '<span class="badge-role eboard">checked in</span>'
        : `<button class="btn-sm" data-checkin-event="${escHtml(ev.id)}">Check In</button>`}</div>
    </div>`;
  }).join('') || '<p class="small muted">No events are open for check-in right now.</p>';
}

document.getElementById('checkin-events-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-checkin-event]');
  if (!btn) return;
  const statusEl = document.getElementById('checkin-status');
  btn.disabled = true; btn.textContent = 'Checking in…';
  const { ok, data } = await api(POINTS_URL, { method: 'POST', body: JSON.stringify({ action: 'checkin', eventId: btn.dataset.checkinEvent }) });
  if (!ok) {
    statusEl.textContent = data.error || 'Could not check in.'; statusEl.className = 'admin-status err';
    btn.disabled = false; btn.textContent = 'Check In';
    return;
  }
  statusEl.textContent = data.alreadyCheckedIn ? 'Already checked in for this event.' : 'Checked in! Your points are pending E-Board approval.';
  statusEl.className = 'admin-status ok';
  loadEventsHistory().then(loadCheckinEvents);
});

// If we arrived via a "sign in to check in" redirect from events.html
// (?checkin=<eventId>), finish that check-in automatically once signed in.
async function attemptPendingCheckin() {
  const eventId = new URLSearchParams(location.search).get('checkin');
  if (!eventId || !me) return;
  const { ok, data } = await api(POINTS_URL, { method: 'POST', body: JSON.stringify({ action: 'checkin', eventId }) });
  const statusEl = document.getElementById('checkin-status');
  if (statusEl) {
    statusEl.textContent = ok
      ? (data.alreadyCheckedIn ? 'Already checked in for that event.' : 'Checked in! Your points are pending E-Board approval.')
      : (data.error || 'Could not check in.');
    statusEl.className = ok ? 'admin-status ok' : 'admin-status err';
  }
  if (ok) loadEventsHistory().then(loadCheckinEvents);
  history.replaceState(null, '', location.pathname);
}

async function init() {
  const { data } = await api(AUTH_URL, { method: 'GET' });
  if (data.ok) { me = data.user; showSignedIn(); } else { showSignedOut(); }
  await attemptPendingCheckin();
}

// ── Sign in / up toggle ────────────────────────────────────
document.getElementById('tab-signin').addEventListener('click', () => {
  document.getElementById('tab-signin').classList.add('active');
  document.getElementById('tab-signup').classList.remove('active');
  document.getElementById('signin-form').style.display = '';
  document.getElementById('signup-form').style.display = 'none';
});
document.getElementById('tab-signup').addEventListener('click', () => {
  document.getElementById('tab-signup').classList.add('active');
  document.getElementById('tab-signin').classList.remove('active');
  document.getElementById('signup-form').style.display = '';
  document.getElementById('signin-form').style.display = 'none';
});

document.getElementById('signin-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('signin-error');
  errEl.textContent = '';
  const email = document.getElementById('si-email').value.trim();
  const password = document.getElementById('si-password').value;
  const { ok, data } = await api(AUTH_URL, { method: 'POST', body: JSON.stringify({ action: 'login', email, password }) });
  if (!ok) { errEl.textContent = data.error || 'Sign-in failed.'; return; }
  me = data.user; showSignedIn(); window.refreshAccountNavLink?.(); attemptPendingCheckin();
});

document.getElementById('signup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('signup-error');
  errEl.textContent = '';
  const name = document.getElementById('su-name').value.trim();
  const email = document.getElementById('su-email').value.trim();
  const password = document.getElementById('su-password').value;
  const { ok, data } = await api(AUTH_URL, { method: 'POST', body: JSON.stringify({ action: 'register', name, email, password }) });
  if (!ok) { errEl.textContent = data.error || 'Could not create account.'; return; }
  me = data.user; showSignedIn(); window.refreshAccountNavLink?.(); attemptPendingCheckin();
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await api(AUTH_URL, { method: 'POST', body: JSON.stringify({ action: 'logout' }) });
  me = null;
  showSignedOut();
  window.refreshAccountNavLink?.();
});

// ── Profile (view / edit toggle) ──────────────────────────
function showProfileView() {
  document.getElementById('profile-view').style.display = '';
  document.getElementById('profile-form').style.display = 'none';
  document.getElementById('profile-edit-btn').style.display = '';
}
function showProfileForm() {
  document.getElementById('profile-view').style.display = 'none';
  document.getElementById('profile-form').style.display = '';
  document.getElementById('profile-edit-btn').style.display = 'none';
  document.getElementById('pf-name').value = me.name || '';
  document.getElementById('pf-email').value = me.email || '';
}
document.getElementById('profile-edit-btn').addEventListener('click', showProfileForm);
document.getElementById('profile-cancel-btn').addEventListener('click', showProfileView);

document.getElementById('profile-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const statusEl = document.getElementById('profile-status');
  const body = {
    name: document.getElementById('pf-name').value.trim(),
    email: document.getElementById('pf-email').value.trim(),
  };
  const { ok, data } = await api(ME_URL, { method: 'PATCH', body: JSON.stringify(body) });
  if (!ok) { statusEl.textContent = data.error || 'Could not save.'; statusEl.className = 'admin-status err'; return; }
  me = data.user;
  statusEl.textContent = 'Saved.'; statusEl.className = 'admin-status ok';
  document.getElementById('whoami').textContent = `Signed in as ${me.name}`;
  fillProfileView();
  showProfileView();
});

document.getElementById('password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const statusEl = document.getElementById('password-status');
  const currentPassword = document.getElementById('pw-current').value;
  const password = document.getElementById('pw-new').value;
  const { ok, data } = await api(ME_URL, { method: 'PATCH', body: JSON.stringify({ currentPassword, password }) });
  if (!ok) { statusEl.textContent = data.error || 'Could not change password.'; statusEl.className = 'admin-status err'; return; }
  statusEl.textContent = 'Password changed.'; statusEl.className = 'admin-status ok';
  document.getElementById('password-form').reset();
});

// Password fields stay hidden until "Change password" is clicked, so the
// profile card isn't cluttered with password inputs by default.
document.getElementById('password-toggle-btn').addEventListener('click', () => {
  document.getElementById('password-form').style.display = '';
  document.getElementById('password-toggle-btn').style.display = 'none';
});
document.getElementById('password-cancel-btn').addEventListener('click', () => {
  document.getElementById('password-form').reset();
  document.getElementById('password-status').textContent = '';
  document.getElementById('password-form').style.display = 'none';
  document.getElementById('password-toggle-btn').style.display = '';
});

// Profile photo upload
document.getElementById('pf-photo-btn').addEventListener('click', () => {
  document.getElementById('pf-photo').click();
});
document.getElementById('pf-photo').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const statusEl = document.getElementById('photo-status');
  statusEl.textContent = 'Uploading…'; statusEl.className = 'admin-status';
  const up = await uploadFile(file, 'profile');
  if (!up.ok) { statusEl.textContent = up.data.error || 'Upload failed.'; statusEl.className = 'admin-status err'; return; }
  const { ok, data } = await api(ME_URL, { method: 'PATCH', body: JSON.stringify({ photoUrl: up.data.url }) });
  if (!ok) { statusEl.textContent = data.error || 'Could not save photo.'; statusEl.className = 'admin-status err'; return; }
  me = data.user;
  fillProfileView();
  statusEl.textContent = 'Photo updated.'; statusEl.className = 'admin-status ok';
  e.target.value = '';
});

document.addEventListener('DOMContentLoaded', init);
})();
