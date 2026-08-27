/* ============================================================
   Digital Choral Library — choral-library.js
   Read-only browse/search view. Scores and sets are now managed
   from the E-Board Portal (/portal.html), backed by the server —
   this page just fetches and displays them.
   ============================================================ */
(() => {
'use strict';

const MEMBER_PASS = 'acda2025';
const LIBRARY_URL = '/.netlify/functions/portal-library';

const ALL_TAGS = ['Classical','Musical Theater','Church Music','Contemporary',
  'Jazz & Pop','Sacred','Secular','A Cappella','Folk'];
const TAG_CLASSES = {
  'Classical':'cat-classical','Musical Theater':'cat-musical-theater',
  'Church Music':'cat-church-music','Contemporary':'cat-contemporary',
  'Jazz & Pop':'cat-jazz-pop','Sacred':'cat-church-music',
  'Secular':'cat-contemporary','A Cappella':'cat-contemporary','Folk':'cat-choral-rep',
};
function tagClass(t){ return TAG_CLASSES[t]||'cat-other'; }

// ── STATE ─────────────────────────────────────────────────
let library  = []; // Score[]
let sessions = []; // {num, name, scoreUrls: string[]}
let memberUnlocked = false;
let activeTag = 'all';
let libSearchTerm = '';

const LS_MB = 'acda_lib_member';

// ── HELPERS ───────────────────────────────────────────────
function escHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escAttr(s){ return String(s||'').replace(/"/g,'&quot;'); }
function composerDisplay(s){ return [s.composer_first,s.composer_last].filter(Boolean).join(' '); }
function getScoreByUrl(url){ return library.find(s=>s.url===url); }
function getSessionScores(sess){ return sess.scoreUrls.map(getScoreByUrl).filter(Boolean); }
function pdfEmbedUrl(url){
  const m=url.match(/drive\.google\.com\/file\/d\/([\w-]+)/);
  return m?`https://drive.google.com/file/d/${m[1]}/preview`:url;
}

// ── PDF PREVIEW LAZY LOADER ───────────────────────────────
let previewObserver=null;
function initPreviewObserver(){
  if(!('IntersectionObserver' in window)) return;
  previewObserver=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(!entry.isIntersecting) return;
      const f=entry.target;
      if(f.dataset.src){ f.src=f.dataset.src; f.removeAttribute('data-src'); }
      previewObserver.unobserve(f);
    });
  },{rootMargin:'120px'});
}
function observePreviews(container){
  if(!previewObserver) return;
  container.querySelectorAll('.pdf-preview[data-src]').forEach(f=>previewObserver.observe(f));
}

// ── SCORE CARD ────────────────────────────────────────────
function scoreCardHTML(score){
  const composer=composerDisplay(score);
  const meta=[
    score.voicing&&escHtml(score.voicing),
    score.instrumentation&&escHtml(score.instrumentation),
    score.year&&escHtml(score.year),
  ].filter(Boolean).join('<span class="meta-sep"> · </span>');
  const tags=score.tags.map(t=>`<span class="score-tag ${tagClass(t)}">${escHtml(t)}</span>`).join('');
  const embed=pdfEmbedUrl(score.url);

  return `<div class="score-card">
    <div class="pdf-preview-wrap">
      <iframe class="pdf-preview" data-src="${escAttr(embed)}"
        title="Preview: ${escAttr(score.title)}" tabindex="-1" loading="lazy"
        scrolling="no"></iframe>
      <div class="pdf-preview-overlay" data-open-pdf
        data-url="${escAttr(score.url)}" data-title="${escAttr(score.title)}"
        aria-label="Open ${escAttr(score.title)}"></div>
    </div>
    <div class="score-info">
      <div class="score-title">${escHtml(score.title)}</div>
      ${composer?`<div class="score-composer">${escHtml(composer)}</div>`:''}
      ${meta?`<div class="score-meta">${meta}</div>`:''}
      ${tags?`<div class="score-tags">${tags}</div>`:''}
      <div class="score-actions">
        <button class="btn-sm" data-open-pdf data-url="${escAttr(score.url)}" data-title="${escAttr(score.title)}">View</button>
        <a class="btn-sm outline" href="${escAttr(score.url)}" target="_blank" rel="noopener">New Tab</a>
      </div>
    </div>
  </div>`;
}

// ── SESSIONS PANEL ────────────────────────────────────────
function renderThisWeek(){
  const pastEl=document.getElementById('past-sessions');
  if(!sessions.length){
    pastEl.innerHTML=`<div class="no-session-notice">
      <div class="no-session-title">No Sets Yet</div>
      <div class="no-session-sub">Check back soon.</div>
    </div>`;
    return;
  }
  pastEl.innerHTML=sessions.map(sess=>{
    const scores=getSessionScores(sess);
    const scoreCards=scores.map(scoreCardHTML).join('');
    return `<div class="session-group" data-session-num="${escAttr(sess.num)}">
      <div class="session-toggle-wrap">
        <button class="session-toggle" aria-expanded="false">
          <span class="session-toggle-left">
            <span class="session-num">${escHtml(sess.num)}</span>
            <span>${escHtml(sess.name)}</span>
            <span class="session-date">${scores.length} score${scores.length!==1?'s':''}</span>
          </span>
          <span class="chevron" aria-hidden="true">&#9660;</span>
        </button>
      </div>
      <div class="session-body">
        <div class="score-grid">${scoreCards||'<div class="empty-state" style="padding:1rem;grid-column:1/-1"><p>No scores in this set yet.</p></div>'}</div>
      </div>
    </div>`;
  }).join('');

  pastEl.querySelectorAll('.session-toggle').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const group=btn.closest('.session-group');
      const open=group.classList.toggle('open');
      btn.setAttribute('aria-expanded',String(open));
      if(open) observePreviews(group);
    });
  });
  observePreviews(pastEl);
}

// ── LIBRARY PANEL ─────────────────────────────────────────
function buildTagChips(){
  const el=document.getElementById('cat-chips');
  const used=new Set(library.flatMap(s=>s.tags));
  el.innerHTML=`<button class="cat-chip ${activeTag==='all'?'active':''}" data-tag="all">All</button>`+
    ALL_TAGS.filter(t=>used.has(t)).map(t=>
      `<button class="cat-chip ${activeTag===t?'active':''}" data-tag="${escAttr(t)}">${escHtml(t)}</button>`
    ).join('');
  el.querySelectorAll('.cat-chip').forEach(chip=>{
    chip.addEventListener('click',()=>{
      activeTag=chip.dataset.tag;
      el.querySelectorAll('.cat-chip').forEach(c=>c.classList.toggle('active',c.dataset.tag===activeTag));
      renderLibrary();
    });
  });
}
function renderLibrary(){
  const el=document.getElementById('lib-results');
  const term=libSearchTerm.toLowerCase();
  const filtered=library.filter(sc=>{
    const matchTag=activeTag==='all'||sc.tags.includes(activeTag);
    const matchTerm=!term||sc.title.toLowerCase().includes(term)||
      composerDisplay(sc).toLowerCase().includes(term)||(sc.year||'').includes(term);
    return matchTag&&matchTerm;
  });
  el.innerHTML=filtered.map(scoreCardHTML).join('')||`<div class="empty-state" style="grid-column:1/-1"><p>No scores match your search.</p></div>`;
  observePreviews(el);
}

// ── PDF VIEWER ────────────────────────────────────────────
function openPDF(url,title){
  const modal=document.getElementById('pdf-modal');
  document.getElementById('pdf-modal-title').textContent=title;
  document.getElementById('pdf-embed').src=url;
  document.getElementById('pdf-newtab-btn').href=url;
  modal.hidden=false; modal.classList.add('open');
  document.body.style.overflow='hidden';
}
function closePDF(){
  const modal=document.getElementById('pdf-modal');
  modal.classList.remove('open'); modal.hidden=true;
  document.getElementById('pdf-embed').src='';
  document.body.style.overflow='';
}

// ── AUTH (member-level view gate) ─────────────────────────
function checkSavedAuth(){
  try{ if(sessionStorage.getItem(LS_MB)==='1') memberUnlocked=true; }catch{}
}
function showLibrary(){
  document.getElementById('lock-section').style.display='none';
  document.getElementById('library-section').style.display='block';
  renderThisWeek(); buildTagChips(); renderLibrary();
}

// ── TABS ──────────────────────────────────────────────────
function initTabs(){
  document.querySelectorAll('.view-tab').forEach(tab=>{
    tab.addEventListener('click',()=>{
      document.querySelectorAll('.view-tab').forEach(t=>{ t.classList.remove('active'); t.setAttribute('aria-selected','false'); });
      document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
      tab.classList.add('active'); tab.setAttribute('aria-selected','true');
      document.getElementById(tab.getAttribute('aria-controls'))?.classList.add('active');
    });
  });
}

// ── LOCK FORM ─────────────────────────────────────────────
function initLockForm(){
  document.getElementById('lock-form').addEventListener('submit',e=>{
    e.preventDefault();
    const pw=document.getElementById('lock-pw').value.trim();
    const errEl=document.getElementById('lock-error');
    if(pw===MEMBER_PASS){
      memberUnlocked=true; try{sessionStorage.setItem(LS_MB,'1')}catch{}
      errEl.textContent=''; showLibrary();
    } else { errEl.textContent='Incorrect password.'; }
  });
}

// ── DELEGATED EVENTS ──────────────────────────────────────
function initDelegates(){
  document.addEventListener('click',e=>{
    const pdfBtn=e.target.closest('[data-open-pdf]');
    if(pdfBtn){ openPDF(pdfBtn.dataset.url,pdfBtn.dataset.title); return; }
  });

  document.getElementById('pdf-modal-close').addEventListener('click',closePDF);
  document.getElementById('pdf-close-btn').addEventListener('click',closePDF);
  document.getElementById('pdf-modal').addEventListener('click',e=>{ if(e.target===e.currentTarget) closePDF(); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape') closePDF(); });
}

// ── SEARCH ────────────────────────────────────────────────
function initSearch(){
  document.getElementById('lib-search').addEventListener('input',e=>{
    libSearchTerm=e.target.value; renderLibrary();
  });
}

// ── BOOT ──────────────────────────────────────────────────
async function init(){
  try{
    const res=await fetch(LIBRARY_URL,{cache:'no-cache'});
    const data=await res.json();
    if(data.ok){ library=data.scores||[]; sessions=data.sessions||[]; }
  } catch{}
  checkSavedAuth();
  initPreviewObserver(); initTabs(); initDelegates();
  initLockForm(); initSearch();
  if(memberUnlocked) showLibrary();
}

document.addEventListener('DOMContentLoaded',init);
})();
