/* ============================================================
   Public event self check-in — js/checkin.js
   ============================================================ */
(() => {
'use strict';

const CHECKIN_URL = '/.netlify/functions/portal-checkin';

function fmtDateRange(startStr, endStr) {
  const start = new Date(startStr);
  const end = endStr ? new Date(endStr) : start;
  const dFmt = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const tFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
  if (isNaN(start)) return '';
  const sameDay = start.toDateString() === end.toDateString();
  return sameDay
    ? `${dFmt.format(start)} • ${tFmt.format(start)}–${tFmt.format(end)}`
    : `${dFmt.format(start)} ${tFmt.format(start)} → ${dFmt.format(end)} ${tFmt.format(end)}`;
}

async function lookupCode(code) {
  if (!code) return;
  try {
    const res = await fetch(`${CHECKIN_URL}?code=${encodeURIComponent(code)}`);
    const data = await res.json();
    if (!data.ok) return;
    const card = document.getElementById('event-card');
    document.getElementById('event-title').textContent = data.event.title;
    document.getElementById('event-meta').textContent =
      [fmtDateRange(data.event.start, data.event.end), data.event.location].filter(Boolean).join(' • ');
    card.style.display = '';
    if (!data.open) {
      document.getElementById('checkin-subtext').textContent = 'Check-in isn’t open for this event right now.';
    }
  } catch { /* silent — form still works without the preview */ }
}

function showSuccess(alreadyCheckedIn) {
  document.getElementById('checkin-form-wrap').style.display = 'none';
  document.getElementById('checkin-success').style.display = '';
  document.getElementById('success-title').textContent = alreadyCheckedIn ? 'Already checked in' : 'You’re checked in!';
  document.getElementById('success-sub').textContent = alreadyCheckedIn
    ? 'Looks like you already checked in to this event.'
    : 'Thanks for coming out — see you at the next one.';
}

function init() {
  const params = new URLSearchParams(location.search);
  const prefillCode = (params.get('code') || '').toUpperCase();
  if (prefillCode) {
    document.getElementById('ci-code').value = prefillCode;
    lookupCode(prefillCode);
  }

  document.getElementById('ci-code').addEventListener('change', (e) => {
    e.target.value = e.target.value.toUpperCase();
    lookupCode(e.target.value.trim());
  });

  document.getElementById('checkin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('checkin-error');
    errEl.textContent = '';
    const code = document.getElementById('ci-code').value.trim().toUpperCase();
    const name = document.getElementById('ci-name').value.trim();
    const email = document.getElementById('ci-email').value.trim();
    if (!code || !name || !email) { errEl.textContent = 'All fields are required.'; return; }

    try {
      const res = await fetch(CHECKIN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, name, email }),
      });
      const data = await res.json();
      if (!data.ok) { errEl.textContent = data.error || 'Could not check in.'; return; }
      showSuccess(!!data.alreadyCheckedIn);
    } catch {
      errEl.textContent = 'Network error — please try again.';
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
})();
