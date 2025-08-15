// js/eboard-dash.js

// ---- Require admin/eboard, else kick to account ----
function guardDash() {
  if (!window.netlifyIdentity) return; // widget loads, then init fires
  const goAccount = () => window.location.replace('account.html');

  netlifyIdentity.on('init', (user) => {
    if (!user) return goAccount();
    const roles = user.app_metadata?.roles || [];
    if (!(roles.includes('admin') || roles.includes('eboard'))) goAccount();
  });
  netlifyIdentity.on('login', () => location.reload());
  netlifyIdentity.on('logout', goAccount);
  netlifyIdentity.init();
}
guardDash();

// ---- Logout button ----
document.getElementById('logoutBtn')?.addEventListener('click', () => {
  window.netlifyIdentity && netlifyIdentity.logout();
});

// ---- Helper: attach Identity JWT (robust on custom domains) ----
async function authHeaders() {
  const user = netlifyIdentity.currentUser();
  if (!user) return {};
  const token = await user.jwt();
  return { Authorization: `Bearer ${token}` };
}

// ---- Load events ----
async function loadEvents() {
  const wrap = document.getElementById('eventsList');
  wrap.innerHTML = '<p class="muted">Loading…</p>';
  const res = await fetch('/.netlify/functions/events-get');
  const items = await res.json();
  if (!Array.isArray(items) || !items.length) {
    wrap.innerHTML = `<p class="muted">No events yet.</p>`;
    return;
  }
  wrap.innerHTML = items.map(renderCard).join('');
  wireRowButtons();
}

function renderCard(e) {
  return `
    <div class="card" data-id="${e.id}">
      <h3 contenteditable="true" data-field="title">${escapeHtml(e.title)}</h3>
      <p class="muted">
        <span contenteditable="true" data-field="starts_at">${escapeHtml(e.starts_at)}</span>
      </p>
      <p contenteditable="true" data-field="summary">${escapeHtml(e.summary || "")}</p>
      <div style="display:flex; gap:10px; margin-top:8px">
        <button class="btn btn-primary" data-action="save">Save</button>
        <button class="btn btn-ghost" data-action="delete">Delete</button>
      </div>
    </div>
  `;
}

function wireRowButtons() {
  document.querySelectorAll('#eventsList .card').forEach(card => {
    card.querySelector('[data-action="save"]').addEventListener('click', () => saveCard(card));
    card.querySelector('[data-action="delete"]').addEventListener('click', () => deleteCard(card));
  });
}

function field(card, name) {
  const el = card.querySelector(`[data-field="${name}"]`);
  return (el?.textContent || '').trim();
}

async function saveCard(card) {
  const payload = {
    id: card.dataset.id,
    title: field(card,'title'),
    summary: field(card,'summary'),
    starts_at: field(card,'starts_at')
  };
  const headers = Object.assign({ 'content-type': 'application/json' }, await authHeaders());
  const res = await fetch('/.netlify/functions/events-admin', {
    method: 'PUT', headers, body: JSON.stringify(payload)
  });
  if (!res.ok) { alert('Save failed'); return; }
  await loadEvents();
}

async function deleteCard(card) {
  if (!confirm('Delete this event?')) return;
  const headers = Object.assign({ 'content-type': 'application/json' }, await authHeaders());
  const res = await fetch('/.netlify/functions/events-admin', {
    method: 'DELETE', headers, body: JSON.stringify({ id: card.dataset.id })
  });
  if (!res.ok) { alert('Delete failed'); return; }
  card.remove();
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// ---- Create form ----
document.getElementById('createForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('title').value.trim();
  const summary = document.getElementById('summary').value.trim();
  const startsAt = document.getElementById('startsAt').value;
  if (!title || !startsAt) { alert('Title and date/time are required'); return; }

  const headers = Object.assign({ 'content-type': 'application/json' }, await authHeaders());
  const res = await fetch('/.netlify/functions/events-admin', {
    method: 'POST',
    headers,
    body: JSON.stringify({ title, summary, starts_at: new Date(startsAt).toISOString() })
  });
  if (!res.ok) { alert('Create failed'); return; }

  e.target.reset();
  loadEvents();
});

// boot
loadEvents();
