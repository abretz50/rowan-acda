/* ============================================================
   Digital Choral Library — choral-library.js

   CONFIG
   ─────────────────────────────────────────────────────────
   MEMBER_PASS  : password members use to browse scores
   EBOARD_PASS  : password for E-Board admin features
   DAT_URL      : path to the .dat data file
   SCRIPT_URL   : Google Apps Script Web App URL (optional,
                  for writing new entries across devices)

   Google Apps Script setup — paste into Extensions > Apps Script
   and deploy as Web App accessible by Anyone:

   function doPost(e) {
     const data  = JSON.parse(e.postData.contents);
     if (data.token !== 'YOUR_TOKEN') return ContentService.createTextOutput('Unauthorized');
     const sheet = SpreadsheetApp.openById('YOUR_SHEET_ID').getActiveSheet();
     sheet.appendRow(data.line.split('|'));
     return ContentService.createTextOutput('OK');
   }
   ============================================================ */

(() => {
'use strict';

// ── CONFIG ────────────────────────────────────────────────
const MEMBER_PASS  = 'acda2025';
const EBOARD_PASS  = 'acda-eboard-2025';
const DAT_URL      = '/assets/data/choral-library.dat';
const SCRIPT_URL   = '';
const SCRIPT_TOKEN = '';

// ── VALID TAGS & VOICINGS ─────────────────────────────────
const ALL_TAGS = [
  'Classical', 'Musical Theater', 'Church Music', 'Contemporary',
  'Jazz & Pop', 'Sacred', 'Secular', 'A Cappella', 'Folk',
];
const ALL_VOICINGS = [
  'SATB', 'SATB divisi', 'SAB', 'SSA', 'SSAA', 'TTBB',
  '2-Part', 'Unison', 'Other',
];
const ALL_INSTRUMENTS = [
  'A Cappella', 'Piano', 'Organ', 'Orchestra', 'Band', 'Guitar', 'Other',
];

// Tag → CSS class mapping
const TAG_CLASSES = {
  'Classical':      'cat-classical',
  'Musical Theater':'cat-musical-theater',
  'Church Music':   'cat-church-music',
  'Contemporary':   'cat-contemporary',
  'Jazz & Pop':     'cat-jazz-pop',
  'Sacred':         'cat-church-music',
  'Secular':        'cat-contemporary',
  'A Cappella':     'cat-contemporary',
  'Folk':           'cat-choral-rep',
};
function tagClass(tag) { return TAG_CLASSES[tag] || 'cat-other'; }

// ── STATE ─────────────────────────────────────────────────
let sessions       = [];
let memberUnlocked = false;
let eboardUnlocked = false;
let activeTag      = 'all';
let libSearchTerm  = '';
let currentSession = null; // the session marked current=Y

const LS_SESSIONS = 'acda_library_sessions_v2';
const LS_MEMBER   = 'acda_library_member';
const LS_EBOARD   = 'acda_library_eboard';

// ── DAT PARSER ────────────────────────────────────────────
function parseDat(text) {
  const result = [];
  let sessionMap = {};

  text.split('\n').forEach(raw => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;

    const parts = line.split('|').map(p => p.trim());
    const type  = parts[0].toUpperCase();

    if (type === 'SESSION') {
      const [, num, name, date, current] = parts;
      const sess = { num, name, date, current: current === 'Y', scores: [] };
      result.push(sess);
      sessionMap[num] = sess;
    } else if (type === 'SCORE') {
      const [, session_num, title, composer_first, composer_last, year,
             voicing, instrumentation, tags_raw, url] = parts;
      const sess = sessionMap[session_num];
      if (!sess) return;
      const tags = (tags_raw || '').split(';').map(t => t.trim()).filter(Boolean);
      sess.scores.push({
        title:           title || '',
        composer_first:  composer_first || '',
        composer_last:   composer_last  || '',
        year:            year           || '',
        voicing:         voicing        || '',
        instrumentation: instrumentation || '',
        tags,
        url: url || '',
      });
    }
  });

  return result;
}

function formatDatLine(type, fields) {
  return type + '|' + fields.join('|');
}

// ── SORT ──────────────────────────────────────────────────
function sortSessions(arr) {
  return [...arr].sort((a, b) => new Date(b.date) - new Date(a.date));
}

// ── HELPERS ───────────────────────────────────────────────
function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}
function composerDisplay(s) {
  if (!s.composer_first && !s.composer_last) return '';
  const name = [s.composer_first, s.composer_last].filter(Boolean).join(' ');
  return name;
}
function escHtml(s) {
  return String(s || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(s) { return String(s || '').replace(/"/g,'&quot;'); }

// ── SCORE CARD ────────────────────────────────────────────
function scoreCardHTML(score, showSession) {
  const composer  = composerDisplay(score);
  const firstTag  = score.tags[0] || '';
  const cls       = tagClass(firstTag);
  const sessionLbl = showSession && score._sessionNum
    ? `<div class="score-session-lbl">${escHtml(score._sessionNum)}</div>` : '';

  const metaItems = [
    score.voicing         && `<span>${escHtml(score.voicing)}</span>`,
    score.instrumentation && `<span>${escHtml(score.instrumentation)}</span>`,
    score.year            && `<span>${escHtml(score.year)}</span>`,
  ].filter(Boolean).join('<span class="meta-sep">·</span>');

  const tagBadges = score.tags.map(t =>
    `<span class="score-tag ${tagClass(t)}">${escHtml(t)}</span>`
  ).join('');

  return `
    <div class="score-card">
      ${sessionLbl}
      <div class="score-title">${escHtml(score.title)}</div>
      ${composer ? `<div class="score-composer">${escHtml(composer)}</div>` : ''}
      ${metaItems ? `<div class="score-meta">${metaItems}</div>` : ''}
      ${tagBadges ? `<div class="score-tags">${tagBadges}</div>` : ''}
      <div class="score-actions">
        <button class="btn-sm" data-open-pdf data-url="${escAttr(score.url)}" data-title="${escAttr(score.title)}">View Score</button>
        <a class="btn-sm outline" href="${escAttr(score.url)}" target="_blank" rel="noopener">Open in New Tab</a>
      </div>
    </div>`;
}

// ── THIS WEEK PANEL ───────────────────────────────────────
function renderThisWeek() {
  const sorted  = sortSessions(sessions);
  const current = sorted.find(s => s.current) || null;
  const past    = sorted.filter(s => !s.current);

  const heroEl   = document.getElementById('this-week-hero');
  const scoresEl = document.getElementById('this-week-scores');
  const pastEl   = document.getElementById('past-sessions');
  const pastHdr  = document.getElementById('past-sessions-heading');

  if (!current) {
    heroEl.innerHTML = `
      <div class="no-session-notice">
        <div class="no-session-title">No Active Session</div>
        <div class="no-session-sub">A new session will appear here once the E-Board opens one.</div>
      </div>`;
    scoresEl.innerHTML = '';
    if (pastHdr) pastHdr.textContent = 'All Sessions';
  } else {
    heroEl.innerHTML = `
      <div class="this-week-hero">
        <div>
          <div class="session-kicker">Current Session</div>
          <h2>${escHtml(current.num)}: ${escHtml(current.name)}</h2>
          <div class="session-meta">${formatDate(current.date)}</div>
        </div>
        <div class="score-count">${current.scores.length} score${current.scores.length !== 1 ? 's' : ''}</div>
      </div>`;

    scoresEl.innerHTML = current.scores.length
      ? current.scores.map(s => scoreCardHTML(s, false)).join('')
      : '<div class="empty-state"><p>No scores added to this session yet.</p></div>';

    if (pastHdr) pastHdr.textContent = 'Previous Sessions';
  }

  pastEl.innerHTML = past.map(sess => `
    <div class="session-group" data-session-num="${escAttr(sess.num)}">
      <button class="session-toggle" aria-expanded="false">
        <span class="session-toggle-left">
          <span class="session-num">${escHtml(sess.num)}</span>
          <span>${escHtml(sess.name)}</span>
          <span class="session-date">${formatDate(sess.date)}</span>
        </span>
        <span class="chevron" aria-hidden="true">&#9660;</span>
      </button>
      <div class="session-body">
        <div class="score-grid">
          ${sess.scores.length
            ? sess.scores.map(s => scoreCardHTML(s, false)).join('')
            : '<div class="empty-state" style="padding:1rem"><p>No scores in this session.</p></div>'}
        </div>
      </div>
    </div>`).join('');

  pastEl.querySelectorAll('.session-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const group = btn.closest('.session-group');
      const open  = group.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(open));
    });
  });
}

// ── LIBRARY PANEL ─────────────────────────────────────────
function buildTagChips() {
  const el = document.getElementById('cat-chips');
  const usedTags = new Set(sessions.flatMap(s => s.scores.flatMap(sc => sc.tags)));

  el.innerHTML = `<button class="cat-chip ${activeTag === 'all' ? 'active' : ''}" data-tag="all">All</button>` +
    ALL_TAGS
      .filter(t => usedTags.has(t))
      .map(t => `<button class="cat-chip ${activeTag === t ? 'active' : ''}" data-tag="${escAttr(t)}">${escHtml(t)}</button>`)
      .join('');

  el.querySelectorAll('.cat-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      activeTag = chip.dataset.tag;
      el.querySelectorAll('.cat-chip').forEach(c => c.classList.toggle('active', c.dataset.tag === activeTag));
      renderLibrary();
    });
  });
}

function renderLibrary() {
  const el   = document.getElementById('lib-results');
  const term = libSearchTerm.toLowerCase();

  const allScores = sortSessions(sessions).flatMap(sess =>
    sess.scores.map(sc => ({ ...sc, _sessionNum: sess.num, _sessionName: sess.name }))
  );

  const filtered = allScores.filter(sc => {
    const matchTag  = activeTag === 'all' || sc.tags.includes(activeTag);
    const matchTerm = !term ||
      sc.title.toLowerCase().includes(term) ||
      composerDisplay(sc).toLowerCase().includes(term) ||
      (sc.year || '').includes(term);
    return matchTag && matchTerm;
  });

  el.innerHTML = filtered.length
    ? filtered.map(sc => scoreCardHTML(sc, true)).join('')
    : `<div class="empty-state" style="grid-column:1/-1"><p>No scores match your search.</p></div>`;
}

// ── E-BOARD PANEL ─────────────────────────────────────────
function renderEboard() {
  const sorted  = sortSessions(sessions);
  const current = sorted.find(s => s.current) || sorted[0];

  document.getElementById('current-session-label').textContent =
    current ? `${current.num}: ${current.name}` : 'No sessions — create one first';

  const adminScores = document.getElementById('admin-scores');
  adminScores.innerHTML = current && current.scores.length
    ? current.scores.map(s => scoreCardHTML(s, false)).join('')
    : '<div class="empty-state"><p>No scores yet — add one using the form above.</p></div>';

  const listEl = document.getElementById('admin-session-list');
  listEl.innerHTML = sorted.map(sess => `
    <div class="admin-session-row">
      <div>
        <span class="admin-session-num">${escHtml(sess.num)}</span>
        <span class="admin-session-name">${escHtml(sess.name)}</span>
        ${sess.current ? '<span class="admin-session-active">Active</span>' : ''}
      </div>
      <span class="admin-session-meta">${formatDate(sess.date)} &nbsp;·&nbsp; ${sess.scores.length} scores</span>
    </div>`).join('') || '<p class="small muted">No sessions yet.</p>';

  // Auto-fill next session number
  if (sorted.length && !document.getElementById('sess-num').value) {
    const lastNum = parseInt((sorted[0].num.match(/\d+/) || ['0'])[0], 10);
    document.getElementById('sess-num').value = 'SS#' + (lastNum + 1);
  }
  if (!document.getElementById('sess-date').value) {
    document.getElementById('sess-date').value = new Date().toISOString().slice(0, 10);
  }
}

// ── PERSISTENCE ───────────────────────────────────────────
function saveSessions() {
  try { localStorage.setItem(LS_SESSIONS, JSON.stringify(sessions)); } catch {}
}

function mergeLocalSessions(base) {
  try {
    const raw = localStorage.getItem(LS_SESSIONS);
    if (!raw) return base;
    const local = JSON.parse(raw);
    const result = [...base];
    local.forEach(lSess => {
      const existing = result.find(s => s.num === lSess.num);
      if (existing) {
        // Merge local-only scores
        const existingUrls = new Set(existing.scores.map(sc => sc.url));
        lSess.scores.forEach(sc => { if (!existingUrls.has(sc.url)) existing.scores.push(sc); });
        // Carry over current flag if set locally
        if (lSess.current) existing.current = true;
      } else {
        result.push(lSess);
      }
    });
    return result;
  } catch { return base; }
}

async function postToScript(line) {
  if (!SCRIPT_URL) return false;
  try {
    const r = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: SCRIPT_TOKEN, line }),
    });
    return r.ok;
  } catch { return false; }
}

// ── AUTH ──────────────────────────────────────────────────
function checkSavedAuth() {
  try {
    if (sessionStorage.getItem(LS_MEMBER) === '1') memberUnlocked = true;
    if (sessionStorage.getItem(LS_EBOARD) === '1') { eboardUnlocked = true; memberUnlocked = true; }
  } catch {}
}
function saveMemberAuth() { try { sessionStorage.setItem(LS_MEMBER, '1'); } catch {} }
function saveEboardAuth()  { try { sessionStorage.setItem(LS_EBOARD, '1'); } catch {} }

function showLibrary() {
  document.getElementById('lock-section').style.display  = 'none';
  document.getElementById('library-section').style.display = 'block';
  if (eboardUnlocked) document.getElementById('tab-eboard').style.display = '';
  renderThisWeek();
  buildTagChips();
  renderLibrary();
  if (eboardUnlocked) renderEboard();
}

// ── PDF VIEWER ────────────────────────────────────────────
function openPDF(url, title) {
  const modal = document.getElementById('pdf-modal');
  document.getElementById('pdf-modal-title').textContent = title;
  document.getElementById('pdf-embed').src = url;
  document.getElementById('pdf-newtab-btn').href = url;
  modal.hidden = false;
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closePDF() {
  const modal = document.getElementById('pdf-modal');
  modal.classList.remove('open');
  modal.hidden = true;
  document.getElementById('pdf-embed').src = '';
  document.body.style.overflow = '';
}

// ── TABS ──────────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.view-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.view-tab').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected','false'); });
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      tab.setAttribute('aria-selected','true');
      document.getElementById(tab.getAttribute('aria-controls'))?.classList.add('active');
    });
  });
}

// ── LOCK FORMS ────────────────────────────────────────────
function initLockForms() {
  document.getElementById('lock-form').addEventListener('submit', e => {
    e.preventDefault();
    const pw    = document.getElementById('lock-pw').value.trim();
    const errEl = document.getElementById('lock-error');
    if (pw === MEMBER_PASS) {
      memberUnlocked = true; saveMemberAuth(); errEl.textContent = ''; showLibrary();
    } else if (pw === EBOARD_PASS) {
      memberUnlocked = true; eboardUnlocked = true; saveMemberAuth(); saveEboardAuth();
      errEl.textContent = ''; showLibrary();
    } else {
      errEl.textContent = 'Incorrect password.';
    }
  });

  document.getElementById('eboard-login-toggle').addEventListener('click', () => {
    const f = document.getElementById('eboard-lock-form');
    f.style.display = f.style.display === 'none' ? '' : 'none';
    if (f.style.display !== 'none') document.getElementById('eboard-pw').focus();
  });

  document.getElementById('eboard-lock-form').addEventListener('submit', e => {
    e.preventDefault();
    const pw    = document.getElementById('eboard-pw').value.trim();
    const errEl = document.getElementById('eboard-lock-error');
    if (pw === EBOARD_PASS) {
      memberUnlocked = true; eboardUnlocked = true; saveMemberAuth(); saveEboardAuth();
      errEl.textContent = ''; showLibrary();
      setTimeout(() => document.getElementById('tab-eboard')?.click(), 50);
    } else {
      errEl.textContent = 'Incorrect E-Board password.';
    }
  });
}

// ── ADMIN FORMS ───────────────────────────────────────────
function initAdminForms() {
  // Add score
  document.getElementById('add-score-form').addEventListener('submit', async e => {
    e.preventDefault();
    const statusEl = document.getElementById('add-score-status');
    const sorted   = sortSessions(sessions);
    const target   = sorted.find(s => s.current) || sorted[0];

    if (!target) {
      statusEl.textContent = 'Create a session first.'; statusEl.className = 'admin-status err'; return;
    }

    const title    = document.getElementById('score-title').value.trim();
    const cfirst   = document.getElementById('score-cfirst').value.trim();
    const clast    = document.getElementById('score-clast').value.trim();
    const year     = document.getElementById('score-year').value.trim();
    const voicing  = document.getElementById('score-voicing').value;
    const instr    = document.getElementById('score-instr').value.trim();
    const tagsRaw  = document.getElementById('score-tags').value.trim();
    const url      = document.getElementById('score-url').value.trim();

    if (!title || !url) {
      statusEl.textContent = 'Title and URL are required.'; statusEl.className = 'admin-status err'; return;
    }

    const tags  = tagsRaw.split(';').map(t => t.trim()).filter(Boolean);
    const score = { title, composer_first: cfirst, composer_last: clast, year, voicing, instrumentation: instr, tags, url };

    const sess = sessions.find(s => s.num === target.num);
    if (sess) sess.scores.push(score);
    saveSessions();

    // Append to .dat (via script)
    const datLine = formatDatLine('SCORE', [target.num, title, cfirst, clast, year, voicing, instr, tags.join(';'), url]);
    if (SCRIPT_URL) {
      statusEl.textContent = 'Saving…'; statusEl.className = 'admin-status';
      const ok = await postToScript(datLine);
      statusEl.textContent = ok ? 'Score added.' : 'Added locally. (Set SCRIPT_URL to sync.)';
      statusEl.className = 'admin-status ' + (ok ? 'ok' : 'err');
    } else {
      statusEl.textContent = 'Score added locally. Commit assets/data/choral-library.dat to persist.';
      statusEl.className = 'admin-status ok';
    }

    e.target.reset();
    renderThisWeek(); renderLibrary(); renderEboard();
  });

  // New session
  document.getElementById('new-session-form').addEventListener('submit', async e => {
    e.preventDefault();
    const statusEl = document.getElementById('new-session-status');
    const num      = document.getElementById('sess-num').value.trim();
    const name     = document.getElementById('sess-name').value.trim();
    const date     = document.getElementById('sess-date').value;
    const makeCurr = document.getElementById('sess-current').checked;

    if (!num || !name || !date) {
      statusEl.textContent = 'All fields are required.'; statusEl.className = 'admin-status err'; return;
    }
    if (sessions.find(s => s.num === num)) {
      statusEl.textContent = `${num} already exists.`; statusEl.className = 'admin-status err'; return;
    }

    if (makeCurr) sessions.forEach(s => { s.current = false; });
    const sess = { num, name, date, current: makeCurr, scores: [] };
    sessions.unshift(sess);
    saveSessions();

    const datLine = formatDatLine('SESSION', [num, name, date, makeCurr ? 'Y' : 'N']);
    if (SCRIPT_URL) {
      statusEl.textContent = 'Saving…'; statusEl.className = 'admin-status';
      const ok = await postToScript(datLine);
      statusEl.textContent = ok ? 'Session created.' : 'Created locally. (Set SCRIPT_URL to sync.)';
      statusEl.className = 'admin-status ' + (ok ? 'ok' : 'err');
    } else {
      statusEl.textContent = 'Session created. Commit choral-library.dat to persist.';
      statusEl.className = 'admin-status ok';
    }

    e.target.reset();
    document.getElementById('sess-num').value = '';
    document.getElementById('sess-date').value = '';
    renderThisWeek(); renderLibrary(); renderEboard();
  });
}

// ── SEARCH ────────────────────────────────────────────────
function initSearch() {
  document.getElementById('lib-search').addEventListener('input', e => {
    libSearchTerm = e.target.value;
    renderLibrary();
  });
}

// ── PDF DELEGATE ─────────────────────────────────────────
function initPDF() {
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-open-pdf]');
    if (btn) openPDF(btn.dataset.url, btn.dataset.title);
  });
  document.getElementById('pdf-modal-close').addEventListener('click', closePDF);
  document.getElementById('pdf-close-btn').addEventListener('click', closePDF);
  document.getElementById('pdf-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closePDF(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePDF(); });
}

// ── BOOT ──────────────────────────────────────────────────
async function init() {
  // Load .dat file; fall back to empty if not found
  let parsed = [];
  try {
    const res = await fetch(DAT_URL, { cache: 'no-cache' });
    if (res.ok) parsed = parseDat(await res.text());
  } catch {}

  sessions = mergeLocalSessions(parsed);
  sessions = sortSessions(sessions);

  checkSavedAuth();
  initTabs();
  initPDF();
  initLockForms();
  initAdminForms();
  initSearch();

  if (memberUnlocked) showLibrary();
}

document.addEventListener('DOMContentLoaded', init);
})();
