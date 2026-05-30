/* ============================================================
   Digital Choral Library — choral-library.js
   ============================================================

   CONFIG — update these values:
   - MEMBER_PASS   : password for members to browse scores
   - EBOARD_PASS   : password for E-Board admin features
   - SCRIPT_URL    : Google Apps Script Web App URL for saving
                     new sessions/scores (see setup note below)
   - SHEET_CSV     : Published Google Sheet CSV URL (optional)
                     If set, live data overrides SESSIONS below.

   ── Google Apps Script setup ──────────────────────────────
   1. Open your Google Sheet → Extensions → Apps Script
   2. Paste this code and deploy as a Web App (Anyone can access):

   function doPost(e) {
     const sheet = SpreadsheetApp.getActiveSpreadsheet();
     const data = JSON.parse(e.postData.contents);
     const token = data.token;
     if (token !== 'YOUR_SECRET_TOKEN') return ContentService.createTextOutput('Unauthorized');
     if (data.type === 'session') {
       const s = sheet.getSheetByName('Sessions') || sheet.insertSheet('Sessions');
       if (s.getLastRow() === 0) s.appendRow(['session_num','session_name','session_date']);
       s.appendRow([data.session_num, data.session_name, data.session_date]);
     }
     if (data.type === 'score') {
       const s = sheet.getSheetByName('Scores') || sheet.insertSheet('Scores');
       if (s.getLastRow() === 0) s.appendRow(['session_num','title','composer','category','drive_url','added']);
       s.appendRow([data.session_num, data.title, data.composer, data.category, data.drive_url, new Date().toISOString()]);
     }
     return ContentService.createTextOutput('OK');
   }

   3. Copy the deployed URL into SCRIPT_URL below.
   ============================================================ */

(() => {
'use strict';

// ── CONFIG ────────────────────────────────────────────────
const MEMBER_PASS  = 'acda2025';
const EBOARD_PASS  = 'acda-eboard-2025'; // change this!
const SCRIPT_URL   = '';   // Google Apps Script Web App URL
const SHEET_CSV    = '';   // Google Sheet published CSV URL (optional live override)
const SCRIPT_TOKEN = '';   // Must match token in your Apps Script

// ── CATEGORY DEFINITIONS ──────────────────────────────────
const CATEGORIES = {
  'choral-rep':      { label: 'Choral Repertoire', cls: 'cat-choral-rep' },
  'musical-theater': { label: 'Musical Theater',   cls: 'cat-musical-theater' },
  'church-music':    { label: 'Church Music',       cls: 'cat-church-music' },
  'contemporary':    { label: 'Contemporary',       cls: 'cat-contemporary' },
  'classical':       { label: 'Classical',          cls: 'cat-classical' },
  'jazz-pop':        { label: 'Jazz & Pop',         cls: 'cat-jazz-pop' },
  'other':           { label: 'Other',              cls: 'cat-other' },
};

// ── HARDCODED SESSIONS (fallback / initial data) ──────────
// Each session: { num, name, date, scores: [{title, composer, category, url}] }
// date format: YYYY-MM-DD
const SESSIONS = [
  {
    num: 'SS#9', name: 'General Meeting', date: '2026-02-06',
    scores: [
      { title: "Break Forth, O Beauteous Heav'nly Light", composer: 'Bach',    category: 'choral-rep',  url: '/assets/pdfs/choral-rep/Break Forth.pdf' },
      { title: 'Danny Boy',                               composer: 'Knight',   category: 'choral-rep',  url: '/assets/pdfs/choral-rep/Danny Boy.pdf' },
      { title: 'Shenandoah',                              composer: 'Adams',    category: 'choral-rep',  url: '/assets/pdfs/choral-rep/Shenandoah.pdf' },
      { title: 'The Pasture',                             composer: 'Stroope',  category: 'choral-rep',  url: '/assets/pdfs/choral-rep/The Pasture.pdf' },
    ],
  },
  {
    num: 'SS#8', name: "Student Conductor's Showcase", date: '2025-11-14',
    scores: [
      { title: 'The Road Home',        composer: 'Paulus',     category: 'choral-rep', url: '/assets/pdfs/choral-rep/The Road Home.pdf' },
      { title: 'Gloria in Excelsis',   composer: 'Vivaldi',    category: 'classical',  url: '/assets/pdfs/choral-rep/Gloria in excelsis.pdf' },
      { title: 'Dies Irae',            composer: 'Ryan Main',  category: 'choral-rep', url: '/assets/pdfs/choral-rep/Dies Irae - Ryan Main.pdf' },
      { title: 'Count the Stars',      composer: 'Beck',       category: 'choral-rep', url: '/assets/pdfs/choral-rep/Count the Stars.pdf' },
    ],
  },
  {
    num: 'SS#6', name: 'Musical Theater Day II', date: '2025-10-24',
    scores: [
      { title: 'Let the Sunshine In',   composer: 'Hair',            category: 'musical-theater', url: '/assets/pdfs/musical-theater/Hair - Let the Sunshine In.pdf' },
      { title: 'My Shot',               composer: 'Hamilton',        category: 'musical-theater', url: '/assets/pdfs/musical-theater/Hamilton - My Shot.pdf' },
      { title: 'Nothing Changes',       composer: 'Hadestown',       category: 'musical-theater', url: '/assets/pdfs/musical-theater/Hadestown - Nothing Changes.pdf' },
      { title: 'Seasons of Love',       composer: 'Rent',            category: 'musical-theater', url: '/assets/pdfs/musical-theater/Rent - Seasons of Love.pdf' },
      { title: 'Opening Up',            composer: 'Waitress',        category: 'musical-theater', url: '/assets/pdfs/musical-theater/Waitress - Opening Up.pdf' },
      { title: 'Once and for All',      composer: 'Newsies',         category: 'musical-theater', url: '/assets/pdfs/musical-theater/Newsies - Once and for All.pdf' },
      { title: 'Louder Than Words',     composer: 'Tick Tick Boom',  category: 'musical-theater', url: '/assets/pdfs/musical-theater/Tick Tick Boom - Louder Than Words.pdf' },
      { title: 'Being Alive',           composer: 'Company',         category: 'musical-theater', url: '/assets/pdfs/musical-theater/Company - Being Alive.pdf' },
      { title: 'What I Did for Love',   composer: 'A Chorus Line',   category: 'musical-theater', url: '/assets/pdfs/musical-theater/A Chorus Line - What I Did for Love.pdf' },
    ],
  },
  {
    num: 'SS#5', name: 'Conducting 101', date: '2025-10-10',
    scores: [
      { title: 'Abide With Me',    composer: '',        category: 'church-music', url: '/assets/pdfs/church-music/Abide With Me.pdf' },
      { title: 'How Great Thou Art', composer: '',      category: 'church-music', url: '/assets/pdfs/church-music/How Great Thou Art.pdf' },
      { title: 'Earth Song',       composer: 'Ticheli', category: 'choral-rep',  url: '/assets/pdfs/choral-rep/Earth Song.pdf' },
    ],
  },
  {
    num: 'SS#4', name: 'ACIT Visit', date: '2025-10-17',
    scores: [
      { title: 'Damask Roses',                  composer: '', category: 'choral-rep',  url: '/assets/pdfs/acit/Damask Roses .pdf' },
      { title: 'Let Me Be Your Star',            composer: '', category: 'musical-theater', url: '/assets/pdfs/acit/Let Me Be Your Star .pdf' },
      { title: 'Loneliness of Evening',          composer: '', category: 'choral-rep',  url: '/assets/pdfs/acit/Loneliness of Evening.pdf' },
      { title: "The Year's at the Spring",       composer: '', category: 'classical',   url: "/assets/pdfs/acit/The year's at the spring.pdf" },
      { title: 'Weep You No More, Sad Fountains', composer: '', category: 'classical',  url: '/assets/pdfs/acit/scan_rmcinnis_2025-10-17-12-08-51.pdf' },
    ],
  },
  {
    num: 'SS#3', name: 'Church Gig 101', date: '2025-09-26',
    scores: [
      { title: 'No One Is Alone',         composer: 'Into the Woods',  category: 'musical-theater', url: '/assets/pdfs/musical-theater/Into The Woods - No One Is Alone.pdf' },
      { title: 'Abide With Me',           composer: '',                category: 'church-music',    url: '/assets/pdfs/church-music/Abide With Me.pdf' },
      { title: 'Lift Every Voice and Sing', composer: '',              category: 'church-music',    url: '/assets/pdfs/church-music/Lift Every Voice and Sing .pdf' },
      { title: 'How Great Thou Art',      composer: '',                category: 'church-music',    url: '/assets/pdfs/church-music/How Great Thou Art.pdf' },
    ],
  },
  {
    num: 'SS#2', name: 'Cabaret Rehearsal', date: '2025-09-12',
    scores: [
      { title: 'No One Is Alone', composer: 'Into the Woods', category: 'musical-theater', url: '/assets/pdfs/musical-theater/Into The Woods - No One Is Alone.pdf' },
      { title: 'The Awakening',   composer: 'Martin',         category: 'choral-rep',      url: '/assets/pdfs/choral-rep/The Awakening - Martin.pdf' },
      { title: 'Earth Song',      composer: 'Ticheli',        category: 'choral-rep',      url: '/assets/pdfs/choral-rep/Earth Song.pdf' },
    ],
  },
  {
    num: 'SS#1', name: 'Musical Theater Day I', date: '2025-08-29',
    scores: [
      { title: 'Sunday',              composer: 'Sunday in the Park with George', category: 'musical-theater', url: '/assets/pdfs/musical-theater/Sunday in the Park with George - Sunday.pdf' },
      { title: 'Alexander Hamilton',  composer: 'Hamilton',                        category: 'musical-theater', url: '/assets/pdfs/musical-theater/Hamilton - Alexander Hamilton.pdf' },
      { title: 'You Will Be Found',   composer: 'Dear Evan Hansen',                category: 'musical-theater', url: '/assets/pdfs/musical-theater/Dear Evan Hansen - You Will Be Found.pdf' },
      { title: 'Medley',              composer: 'Les Misérables',                  category: 'musical-theater', url: '/assets/pdfs/musical-theater/Les Miserables - Medley.pdf' },
      { title: 'Wait for Me',         composer: 'Hadestown',                       category: 'musical-theater', url: '/assets/pdfs/musical-theater/Hadestown - Wait for Me.pdf' },
      { title: 'No One Is Alone',     composer: 'Into the Woods',                  category: 'musical-theater', url: '/assets/pdfs/musical-theater/Into The Woods - No One Is Alone.pdf' },
      { title: 'Somewhere',           composer: 'West Side Story',                 category: 'musical-theater', url: '/assets/pdfs/musical-theater/West Side - Somewhere.pdf' },
    ],
  },
];

// ── STATE ─────────────────────────────────────────────────
let sessions       = [...SESSIONS]; // sorted newest-first
let memberUnlocked = false;
let eboardUnlocked = false;
let activeCategory = 'all';
let libSearchTerm  = '';

// localStorage keys
const LS_SESSIONS  = 'acda_library_sessions';
const LS_MEMBER    = 'acda_library_member';
const LS_EBOARD    = 'acda_library_eboard';

// ── HELPERS ───────────────────────────────────────────────
function sortSessions(arr) {
  return [...arr].sort((a, b) => new Date(b.date) - new Date(a.date));
}

function categoryBadge(cat) {
  const c = CATEGORIES[cat] || CATEGORIES.other;
  return `<span class="score-cat ${c.cls}">${c.label}</span>`;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function openPDF(url, title) {
  const modal  = document.getElementById('pdf-modal');
  const embed  = document.getElementById('pdf-embed');
  const newTab = document.getElementById('pdf-newtab-btn');
  document.getElementById('pdf-modal-title').textContent = title;
  embed.src    = url;
  newTab.href  = url;
  modal.hidden = false;
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closePDF() {
  const modal = document.getElementById('pdf-modal');
  const embed = document.getElementById('pdf-embed');
  modal.classList.remove('open');
  modal.hidden = true;
  embed.src    = '';
  document.body.style.overflow = '';
}

// ── SCORE CARD ────────────────────────────────────────────
function scoreCardHTML(score, showSession = false) {
  const cat = CATEGORIES[score.category] || CATEGORIES.other;
  const sessionLabel = showSession && score._sessionNum
    ? `<div style="font-size:.78rem;color:var(--muted);margin-bottom:.2rem">${score._sessionNum}</div>` : '';
  return `
    <div class="score-card">
      ${sessionLabel}
      <div class="score-title">${escHtml(score.title)}</div>
      ${score.composer ? `<div class="score-composer">${escHtml(score.composer)}</div>` : ''}
      <span class="score-cat ${cat.cls}">${cat.label}</span>
      <div class="score-actions">
        <button class="btn-sm" data-open-pdf data-url="${escAttr(score.url)}" data-title="${escAttr(score.title)}">View Score</button>
        <a class="btn-sm outline" href="${escAttr(score.url)}" target="_blank" rel="noopener">↗ New Tab</a>
      </div>
    </div>`;
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(s) {
  return String(s || '').replace(/"/g, '&quot;');
}

// ── THIS WEEK PANEL ───────────────────────────────────────
function renderThisWeek() {
  const sorted  = sortSessions(sessions);
  const current = sorted[0];
  const past    = sorted.slice(1);

  const heroEl   = document.getElementById('this-week-hero');
  const scoresEl = document.getElementById('this-week-scores');
  const pastEl   = document.getElementById('past-sessions');

  if (!current) {
    heroEl.innerHTML = '<div class="empty-state"><div class="empty-icon">📂</div><p>No sessions yet.</p></div>';
    scoresEl.innerHTML = '';
    pastEl.innerHTML = '';
    return;
  }

  heroEl.innerHTML = `
    <div class="this-week-hero">
      <div>
        <h2>${escHtml(current.num)}: ${escHtml(current.name)}</h2>
        <div class="session-meta">${formatDate(current.date)}</div>
      </div>
      <div class="score-count">${current.scores.length} score${current.scores.length !== 1 ? 's' : ''}</div>
    </div>`;

  scoresEl.innerHTML = current.scores.length
    ? current.scores.map(s => scoreCardHTML(s)).join('')
    : '<div class="empty-state"><div class="empty-icon">🎵</div><p>No scores added yet.</p></div>';

  // Past sessions accordion
  pastEl.innerHTML = past.map(sess => `
    <div class="session-group" data-session-num="${escAttr(sess.num)}">
      <button class="session-toggle" aria-expanded="false">
        <span class="session-toggle-left">
          <span class="session-num">${escHtml(sess.num)}</span>
          <span>${escHtml(sess.name)}</span>
          <span class="session-date">${formatDate(sess.date)}</span>
        </span>
        <span class="chevron" aria-hidden="true">▾</span>
      </button>
      <div class="session-body">
        <div class="score-grid">
          ${sess.scores.length
            ? sess.scores.map(s => scoreCardHTML(s)).join('')
            : '<div class="empty-state" style="padding:1rem"><p>No scores in this session.</p></div>'}
        </div>
      </div>
    </div>`).join('');

  // Accordion toggle
  pastEl.querySelectorAll('.session-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const group = btn.closest('.session-group');
      const open  = group.classList.toggle('open');
      btn.setAttribute('aria-expanded', open);
    });
  });
}

// ── LIBRARY PANEL ─────────────────────────────────────────
function buildCatChips() {
  const el = document.getElementById('cat-chips');
  const usedCats = new Set(sessions.flatMap(s => s.scores.map(sc => sc.category)));

  el.innerHTML = `<button class="cat-chip ${activeCategory === 'all' ? 'active' : ''}" data-cat="all">All</button>` +
    Object.entries(CATEGORIES)
      .filter(([k]) => usedCats.has(k))
      .map(([k, v]) => `<button class="cat-chip ${activeCategory === k ? 'active' : ''}" data-cat="${k}">${v.label}</button>`)
      .join('');

  el.querySelectorAll('.cat-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      activeCategory = chip.dataset.cat;
      el.querySelectorAll('.cat-chip').forEach(c => c.classList.toggle('active', c.dataset.cat === activeCategory));
      renderLibrary();
    });
  });
}

function renderLibrary() {
  const el    = document.getElementById('lib-results');
  const term  = libSearchTerm.toLowerCase();

  const allScores = sessions.flatMap(sess =>
    sess.scores.map(sc => ({ ...sc, _sessionNum: sess.num, _sessionName: sess.name }))
  );

  const filtered = allScores.filter(sc => {
    const matchCat  = activeCategory === 'all' || sc.category === activeCategory;
    const matchTerm = !term ||
      sc.title.toLowerCase().includes(term) ||
      (sc.composer || '').toLowerCase().includes(term);
    return matchCat && matchTerm;
  });

  el.innerHTML = filtered.length
    ? filtered.map(sc => scoreCardHTML(sc, true)).join('')
    : `<div class="empty-state" style="grid-column:1/-1">
        <div class="empty-icon">🔍</div>
        <p>No scores match your search.</p>
       </div>`;
}

// ── E-BOARD PANEL ─────────────────────────────────────────
function renderEboard() {
  const sorted  = sortSessions(sessions);
  const current = sorted[0];

  document.getElementById('current-session-label').textContent =
    current ? `${current.num}: ${current.name}` : 'No sessions yet';

  // Scores for current session
  const adminScores = document.getElementById('admin-scores');
  adminScores.innerHTML = current && current.scores.length
    ? current.scores.map(s => scoreCardHTML(s)).join('')
    : '<div class="empty-state"><div class="empty-icon">🎵</div><p>No scores yet — add one above.</p></div>';

  // Session list
  const listEl = document.getElementById('admin-session-list');
  listEl.innerHTML = sorted.map(sess => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:.5rem .6rem;background:#fff;border:1px solid var(--border);border-radius:.6rem">
      <span style="font-weight:700;font-size:.88rem">${escHtml(sess.num)}: ${escHtml(sess.name)}</span>
      <span style="font-size:.8rem;color:var(--muted)">${formatDate(sess.date)} · ${sess.scores.length} scores</span>
    </div>`).join('') || '<p class="small" style="color:var(--muted)">No sessions yet.</p>';

  // Auto-fill session # for new session
  const nextNum = sorted.length
    ? 'SS#' + (parseInt((sorted[0].num.match(/\d+/) || ['0'])[0], 10) + 1)
    : 'SS#1';
  const sessNumInput = document.getElementById('sess-num');
  if (!sessNumInput.value) sessNumInput.value = nextNum;

  // Default date to today
  const sessDateInput = document.getElementById('sess-date');
  if (!sessDateInput.value) sessDateInput.value = new Date().toISOString().slice(0, 10);
}

// ── PERSISTENCE ───────────────────────────────────────────
function saveSessions() {
  try { localStorage.setItem(LS_SESSIONS, JSON.stringify(sessions)); } catch {}
}

function loadLocalSessions() {
  try {
    const raw = localStorage.getItem(LS_SESSIONS);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Merge: add any local sessions not in hardcoded list
      const hardNums = new Set(SESSIONS.map(s => s.num));
      const extra    = parsed.filter(s => !hardNums.has(s.num));
      // Also merge local scores into existing sessions
      parsed.forEach(lSess => {
        const existing = sessions.find(s => s.num === lSess.num);
        if (existing) {
          const existingUrls = new Set(existing.scores.map(sc => sc.url));
          lSess.scores.forEach(sc => { if (!existingUrls.has(sc.url)) existing.scores.push(sc); });
        }
      });
      sessions = [...sessions, ...extra];
    }
  } catch {}
}

async function postToScript(payload) {
  if (!SCRIPT_URL) return false;
  try {
    const r = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, token: SCRIPT_TOKEN }),
    });
    return r.ok;
  } catch { return false; }
}

// ── AUTH ──────────────────────────────────────────────────
function checkSavedAuth() {
  try {
    if (sessionStorage.getItem(LS_MEMBER)  === '1') { memberUnlocked = true; }
    if (sessionStorage.getItem(LS_EBOARD)  === '1') { eboardUnlocked = true; memberUnlocked = true; }
  } catch {}
}

function saveMemberAuth()  { try { sessionStorage.setItem(LS_MEMBER, '1'); } catch {} }
function saveEboardAuth()  { try { sessionStorage.setItem(LS_EBOARD, '1'); } catch {} }

function showLibrary() {
  document.getElementById('lock-section').style.display = 'none';
  document.getElementById('library-section').style.display = 'block';

  if (eboardUnlocked) {
    document.getElementById('tab-eboard').style.display = '';
  }

  renderThisWeek();
  buildCatChips();
  renderLibrary();
  if (eboardUnlocked) renderEboard();
}

// ── TAB SWITCHING ─────────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.view-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.view-tab').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected','false'); });
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      const panelId = tab.getAttribute('aria-controls');
      document.getElementById(panelId)?.classList.add('active');
    });
  });
}

// ── DELEGATE PDF OPEN ─────────────────────────────────────
function initPDFDelegate() {
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-open-pdf]');
    if (!btn) return;
    openPDF(btn.dataset.url, btn.dataset.title);
  });

  document.getElementById('pdf-modal-close').addEventListener('click', closePDF);
  document.getElementById('pdf-close-btn').addEventListener('click', closePDF);
  document.getElementById('pdf-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closePDF();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePDF(); });
}

// ── LOCK FORMS ────────────────────────────────────────────
function initLockForms() {
  // Member unlock
  document.getElementById('lock-form').addEventListener('submit', e => {
    e.preventDefault();
    const pw = document.getElementById('lock-pw').value.trim();
    const errEl = document.getElementById('lock-error');
    if (pw === MEMBER_PASS) {
      memberUnlocked = true; saveMemberAuth(); errEl.textContent = ''; showLibrary();
    } else if (pw === EBOARD_PASS) {
      memberUnlocked = true; eboardUnlocked = true; saveMemberAuth(); saveEboardAuth(); errEl.textContent = ''; showLibrary();
    } else {
      errEl.textContent = 'Incorrect password. Try again.';
    }
  });

  // E-Board login toggle
  document.getElementById('eboard-login-toggle').addEventListener('click', () => {
    const f = document.getElementById('eboard-lock-form');
    f.style.display = f.style.display === 'none' ? '' : 'none';
    if (f.style.display !== 'none') document.getElementById('eboard-pw').focus();
  });

  // E-Board unlock
  document.getElementById('eboard-lock-form').addEventListener('submit', e => {
    e.preventDefault();
    const pw = document.getElementById('eboard-pw').value.trim();
    const errEl = document.getElementById('eboard-lock-error');
    if (pw === EBOARD_PASS) {
      memberUnlocked = true; eboardUnlocked = true; saveMemberAuth(); saveEboardAuth();
      errEl.textContent = ''; showLibrary();
      // Auto-switch to E-Board tab
      setTimeout(() => document.getElementById('tab-eboard')?.click(), 50);
    } else {
      errEl.textContent = 'Incorrect E-Board password.';
    }
  });
}

// ── ADMIN FORMS ───────────────────────────────────────────
function initAdminForms() {
  // Add score to current session
  document.getElementById('add-score-form').addEventListener('submit', async e => {
    e.preventDefault();
    const statusEl = document.getElementById('add-score-status');
    const sorted   = sortSessions(sessions);
    const current  = sorted[0];

    if (!current) {
      statusEl.textContent = 'Create a session first.'; statusEl.className = 'admin-status err'; return;
    }

    const title    = document.getElementById('score-title').value.trim();
    const composer = document.getElementById('score-composer').value.trim();
    const category = document.getElementById('score-category').value;
    const url      = document.getElementById('score-url').value.trim();

    if (!title || !category || !url) {
      statusEl.textContent = 'Title, Category, and URL are required.'; statusEl.className = 'admin-status err'; return;
    }

    const score = { title, composer, category, url };
    const sess  = sessions.find(s => s.num === current.num);
    if (sess) sess.scores.push(score);
    saveSessions();

    // Try to sync to Google Sheet
    if (SCRIPT_URL) {
      statusEl.textContent = 'Saving…'; statusEl.className = 'admin-status';
      const ok = await postToScript({ type: 'score', session_num: current.num, ...score });
      statusEl.textContent = ok ? 'Saved to library!' : 'Added locally (sync failed — check SCRIPT_URL).';
      statusEl.className   = 'admin-status ' + (ok ? 'ok' : 'err');
    } else {
      statusEl.textContent = 'Added! (Set SCRIPT_URL to sync across devices.)';
      statusEl.className   = 'admin-status ok';
    }

    e.target.reset();
    renderThisWeek();
    renderLibrary();
    renderEboard();
  });

  // New session
  document.getElementById('new-session-form').addEventListener('submit', async e => {
    e.preventDefault();
    const statusEl = document.getElementById('new-session-status');

    const num  = document.getElementById('sess-num').value.trim();
    const name = document.getElementById('sess-name').value.trim();
    const date = document.getElementById('sess-date').value;

    if (!num || !name || !date) {
      statusEl.textContent = 'All fields required.'; statusEl.className = 'admin-status err'; return;
    }
    if (sessions.find(s => s.num === num)) {
      statusEl.textContent = `Session ${num} already exists.`; statusEl.className = 'admin-status err'; return;
    }

    const sess = { num, name, date, scores: [] };
    sessions.unshift(sess);
    saveSessions();

    if (SCRIPT_URL) {
      statusEl.textContent = 'Saving…'; statusEl.className = 'admin-status';
      const ok = await postToScript({ type: 'session', session_num: num, session_name: name, session_date: date });
      statusEl.textContent = ok ? 'Session created!' : 'Created locally (sync failed — check SCRIPT_URL).';
      statusEl.className   = 'admin-status ' + (ok ? 'ok' : 'err');
    } else {
      statusEl.textContent = 'Session created!';
      statusEl.className   = 'admin-status ok';
    }

    e.target.reset();
    document.getElementById('sess-num').value  = '';
    document.getElementById('sess-date').value = '';
    renderThisWeek();
    renderLibrary();
    renderEboard();
  });
}

// ── LIBRARY SEARCH ────────────────────────────────────────
function initLibSearch() {
  document.getElementById('lib-search').addEventListener('input', e => {
    libSearchTerm = e.target.value;
    renderLibrary();
  });
}

// ── BOOT ──────────────────────────────────────────────────
function init() {
  loadLocalSessions();
  sessions = sortSessions(sessions);
  checkSavedAuth();
  initTabs();
  initPDFDelegate();
  initLockForms();
  initAdminForms();
  initLibSearch();

  if (memberUnlocked) showLibrary();
}

document.addEventListener('DOMContentLoaded', init);
})();
