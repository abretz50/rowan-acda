/* ============================================================
   My Account — js/account.js
   Sign in / self-registration / profile / authenticated check-in.
   ============================================================ */
(() => {
'use strict';

const AUTH_URL   = '/.netlify/functions/portal-auth';
const ME_URL     = '/.netlify/functions/portal-me';
const POINTS_URL = '/.netlify/functions/portal-points';

const EBOARD_ROLES = ['president', 'admin', 'vice_president', 'secretary', 'treasurer', 'event_coordinator', 'media', 'senator', 'eboard_legacy'];

let me = null;

function escHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

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
  document.getElementById('view-year').textContent = me.year || '—';
  document.getElementById('view-address').textContent = me.mailingAddress || '—';
}

function showSignedIn() {
  document.getElementById('signed-out').style.display = 'none';
  document.getElementById('signed-in').style.display = '';
  document.getElementById('whoami').textContent = `Signed in as ${me.name}`;
  document.getElementById('portal-link').style.display = EBOARD_ROLES.includes(me.role) ? '' : 'none';
  document.getElementById('checkin-card').style.display = EBOARD_ROLES.includes(me.role) ? 'none' : '';
  fillProfileView();
  document.getElementById('pf-name').value = me.name || '';
  document.getElementById('pf-email').value = me.email || '';
  document.getElementById('pf-year').value = me.year || '';
  document.getElementById('pf-address').value = me.mailingAddress || '';
  loadEventsHistory();
}

async function loadEventsHistory() {
  const { ok, data } = await api(`${POINTS_URL}?mine=1`, { method: 'GET' });
  const listEl = document.getElementById('events-history-list');
  if (!ok) { listEl.innerHTML = '<p class="small muted">Could not load.</p>'; return; }
  listEl.innerHTML = data.points
    .slice().sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt))
    .map(p => `<div class="admin-row">
      <div>
        <span class="name">${escHtml(p.eventTitle || p.reason || 'Event')}</span>
        <div class="meta">${new Date(p.requestedAt).toLocaleDateString()}</div>
      </div>
      <div class="actions"><span class="badge-role ${p.status === 'approved' ? 'eboard' : p.status === 'denied' ? 'inactive' : 'admin'}">${p.status === 'pending' ? 'pending review' : p.status}</span></div>
    </div>`).join('') || '<p class="small muted">No events yet — check in to one to get started.</p>';
}

async function init() {
  const { data } = await api(AUTH_URL, { method: 'GET' });
  if (data.ok) { me = data.user; showSignedIn(); } else { showSignedOut(); }

  const params = new URLSearchParams(location.search);
  const code = (params.get('code') || '').toUpperCase();
  if (code) document.getElementById('ci-code').value = code;
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
  const username = document.getElementById('si-username').value.trim();
  const password = document.getElementById('si-password').value;
  const { ok, data } = await api(AUTH_URL, { method: 'POST', body: JSON.stringify({ action: 'login', username, password }) });
  if (!ok) { errEl.textContent = data.error || 'Sign-in failed.'; return; }
  me = data.user; showSignedIn();
});

document.getElementById('signup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('signup-error');
  errEl.textContent = '';
  const name = document.getElementById('su-name').value.trim();
  const email = document.getElementById('su-email').value.trim();
  const username = document.getElementById('su-username').value.trim();
  const password = document.getElementById('su-password').value;
  const { ok, data } = await api(AUTH_URL, { method: 'POST', body: JSON.stringify({ action: 'register', name, email, username, password }) });
  if (!ok) { errEl.textContent = data.error || 'Could not create account.'; return; }
  me = data.user; showSignedIn();
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await api(AUTH_URL, { method: 'POST', body: JSON.stringify({ action: 'logout' }) });
  me = null;
  showSignedOut();
});

// ── Check-in ──────────────────────────────────────────────
document.getElementById('checkin-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const statusEl = document.getElementById('checkin-status');
  const code = document.getElementById('ci-code').value.trim().toUpperCase();
  const { ok, data } = await api(POINTS_URL, { method: 'POST', body: JSON.stringify({ action: 'checkin', code }) });
  if (!ok) { statusEl.textContent = data.error || 'Could not check in.'; statusEl.className = 'admin-status err'; return; }
  statusEl.textContent = data.alreadyCheckedIn ? 'Already checked in for this event.' : 'Checked in! Your points are pending E-Board approval.';
  statusEl.className = 'admin-status ok';
  document.getElementById('checkin-form').reset();
  loadEventsHistory();
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
  document.getElementById('pf-year').value = me.year || '';
  document.getElementById('pf-address').value = me.mailingAddress || '';
}
document.getElementById('profile-edit-btn').addEventListener('click', showProfileForm);
document.getElementById('profile-cancel-btn').addEventListener('click', showProfileView);

document.getElementById('profile-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const statusEl = document.getElementById('profile-status');
  const body = {
    name: document.getElementById('pf-name').value.trim(),
    email: document.getElementById('pf-email').value.trim(),
    year: document.getElementById('pf-year').value.trim(),
    mailingAddress: document.getElementById('pf-address').value.trim(),
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

document.addEventListener('DOMContentLoaded', init);
})();
