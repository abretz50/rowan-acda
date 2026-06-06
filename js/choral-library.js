/* ============================================================
   Digital Choral Library — choral-library.js
   Data model: library (flat scores) + sessions (sets of URLs)
   ============================================================ */
(() => {
'use strict';

const MEMBER_PASS = 'acda2025';
const EBOARD_PASS = 'ilovetosing';
const DAT_URL     = '/assets/data/choral-library.dat';

const ALL_TAGS = ['Classical','Musical Theater','Church Music','Contemporary',
  'Jazz & Pop','Sacred','Secular','A Cappella','Folk'];
const TAG_CLASSES = {
  'Classical':'cat-classical','Musical Theater':'cat-musical-theater',
  'Church Music':'cat-church-music','Contemporary':'cat-contemporary',
  'Jazz & Pop':'cat-jazz-pop','Sacred':'cat-church-music',
  'Secular':'cat-contemporary','A Cappella':'cat-contemporary','Folk':'cat-choral-rep',
};
function tagClass(t){ return TAG_CLASSES[t]||'cat-other'; }

// ── CONFIG ────────────────────────────────────────────────
// After deploying the Cloudflare Worker, paste its URL here:
const UPLOAD_WORKER_URL = 'https://rowan-acda-upload.YOUR-SUBDOMAIN.workers.dev/upload';

// ── STATE ─────────────────────────────────────────────────
let library  = []; // Score[]
let sessions = []; // {num, name, scoreUrls: string[]}
let memberUnlocked = false;
let eboardUnlocked = false;
let activeTag = 'all';
let libSearchTerm = '';
let editTarget = null; // {scoreIdx}

const LS_LIB  = 'acda_library_v3';
const LS_SESS = 'acda_sessions_v3';
const LS_MB   = 'acda_lib_member';
const LS_EB   = 'acda_lib_eboard';

// ── PARSE ─────────────────────────────────────────────────
function parseDat(text){
  const scores=[], sessMap={}, sessOrder=[];
  text.split('\n').forEach(raw=>{
    const line=raw.trim();
    if(!line||line.startsWith('#')) return;
    const p=line.split('|').map(x=>x.trim());
    const type=p[0].toUpperCase();
    if(type==='SCORE'){
      const [,title,cf,cl,year,voicing,instr,tags_raw,url]=p;
      scores.push({title:title||'',composer_first:cf||'',composer_last:cl||'',
        year:year||'',voicing:voicing||'',instrumentation:instr||'',
        tags:(tags_raw||'').split(';').map(t=>t.trim()).filter(Boolean),url:url||''});
    } else if(type==='SESSION'){
      const [,num,name]=p;
      const s={num,name,scoreUrls:[]};
      sessMap[num]=s; sessOrder.push(s);
    } else if(type==='SET'){
      const [,num,...rest]=p;
      // url may contain pipes so rejoin
      const url=rest.join('|').trim();
      if(sessMap[num]&&url) sessMap[num].scoreUrls.push(url);
    }
  });
  return {library:scores, sessions:sessOrder};
}

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
function getSelectedTags(sel){ return Array.from(sel.selectedOptions).map(o=>o.value); }
function urlId(url){ return url.replace(/[^a-z0-9]/gi,'-'); }

// ── PERSISTENCE ───────────────────────────────────────────
function saveAll(){
  try{
    localStorage.setItem(LS_LIB, JSON.stringify(library));
    localStorage.setItem(LS_SESS, JSON.stringify(sessions.map(s=>({...s,scoreUrls:[...s.scoreUrls]}))));
  } catch{}
}
function mergeLocal(base){
  try{
    const localLib  = JSON.parse(localStorage.getItem(LS_LIB)||'null');
    const localSess = JSON.parse(localStorage.getItem(LS_SESS)||'null');
    let lib=[...base.library], sess=base.sessions.map(s=>({...s,scoreUrls:[...s.scoreUrls]}));
    if(localLib){
      const existUrls=new Set(lib.map(s=>s.url));
      localLib.forEach(s=>{ if(!existUrls.has(s.url)) lib.push(s); });
    }
    if(localSess){
      const sessMap={}; sess.forEach(s=>{ sessMap[s.num]=s; });
      localSess.forEach(ls=>{
        if(sessMap[ls.num]){
          const existing=new Set(sessMap[ls.num].scoreUrls);
          ls.scoreUrls.forEach(u=>{ if(!existing.has(u)) sessMap[ls.num].scoreUrls.push(u); });
          sessMap[ls.num].name=ls.name;
        } else {
          sess.push({...ls,scoreUrls:[...ls.scoreUrls]});
        }
      });
    }
    return {library:lib, sessions:sess};
  } catch{ return base; }
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
function scoreCardHTML(score, opts={}){
  const {showRemove=false, sessNum='', showEdit=false, showAddToSet=false, scoreIdx=-1}=opts;
  const composer=composerDisplay(score);
  const meta=[
    score.voicing&&escHtml(score.voicing),
    score.instrumentation&&escHtml(score.instrumentation),
    score.year&&escHtml(score.year),
  ].filter(Boolean).join('<span class="meta-sep"> · </span>');
  const tags=score.tags.map(t=>`<span class="score-tag ${tagClass(t)}">${escHtml(t)}</span>`).join('');
  const embed=pdfEmbedUrl(score.url);
  const uid=urlId(score.url);

  const sessOptions=sessions.map(s=>
    `<option value="${escAttr(s.num)}">${escHtml(s.num)}: ${escHtml(s.name)}</option>`).join('');

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
        ${showRemove?`<button class="btn-sm delete" data-remove-from-set data-sess="${escAttr(sessNum)}" data-url="${escAttr(score.url)}">Remove</button>`:''}
        ${showEdit?`<button class="btn-sm outline" data-edit-score data-idx="${scoreIdx}">Edit</button>
        <button class="btn-sm delete" data-delete-score data-idx="${scoreIdx}">Delete</button>`:''}
        ${showAddToSet&&sessions.length?`<button class="btn-sm outline" data-toggle-ats data-uid="${uid}">+ Add to Set</button>`:''}
      </div>
      ${showEdit?`<div class="delete-confirm" id="del-confirm-${scoreIdx}" style="display:none">
        <span>Delete this score?</span>
        <button class="btn-sm delete" data-confirm-delete data-idx="${scoreIdx}">Yes, delete</button>
        <button class="btn-sm outline" data-cancel-delete data-idx="${scoreIdx}">Cancel</button>
      </div>`:''}
      ${showAddToSet&&sessions.length?`<div class="add-to-set-panel" id="ats-${uid}" style="display:none">
        <select class="ats-select">${sessOptions}</select>
        <button class="btn-sm" data-do-add-to-set data-url="${escAttr(score.url)}" data-uid="${uid}">Add to Set</button>
        <span class="ats-msg"></span>
      </div>`:''}
    </div>
  </div>`;
}

// ── SESSIONS PANEL ────────────────────────────────────────
function renderThisWeek(){
  const pastEl=document.getElementById('past-sessions');
  if(!sessions.length){
    pastEl.innerHTML=`<div class="no-session-notice">
      <div class="no-session-title">No Sets Yet</div>
      <div class="no-session-sub">Use the E-Board panel to create a set.</div>
    </div>`;
    return;
  }
  pastEl.innerHTML=sessions.map(sess=>{
    const scores=getSessionScores(sess);
    const eboardHeader=eboardUnlocked?`<div class="session-header-btns">
      <button class="btn-sm outline" data-sess-edit data-sess="${escAttr(sess.num)}">Edit</button>
      <button class="btn-sm delete" data-sess-delete data-sess="${escAttr(sess.num)}">Delete Set</button>
    </div>`:'';
    const editForm=eboardUnlocked?`<div class="sess-inline-edit" id="sess-edit-${escAttr(sess.num)}" style="display:none">
      <div class="form-row" style="gap:.4rem;margin:.5rem .75rem">
        <input class="admin-input" type="text" id="edit-snum-${escAttr(sess.num)}" value="${escAttr(sess.num)}" placeholder="Set ID"/>
        <input class="admin-input" type="text" id="edit-sname-${escAttr(sess.num)}" value="${escAttr(sess.name)}" placeholder="Set name"/>
        <button class="btn-sm" data-sess-save data-sess="${escAttr(sess.num)}">Save</button>
        <button class="btn-sm outline" data-sess-edit-cancel data-sess="${escAttr(sess.num)}">Cancel</button>
      </div>
    </div>`:'';
    const scoreCards=scores.map(sc=>scoreCardHTML(sc,{showRemove:eboardUnlocked,sessNum:sess.num})).join('');
    const addFromLib=eboardUnlocked?`<div class="add-scores-section">
      <button class="btn btn-outline" style="font-size:.82rem;padding:.4rem .9rem"
        data-show-lib-picker data-sess="${escAttr(sess.num)}">Add Scores from Library</button>
      <div class="lib-picker" id="lib-picker-${escAttr(sess.num)}" style="display:none">
        <input type="search" class="lib-picker-search" placeholder="Search library…"/>
        <div class="lib-picker-results"></div>
      </div>
    </div>`:'';

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
        ${eboardHeader}
      </div>
      ${editForm}
      <div class="session-body">
        <div class="score-grid">${scoreCards||'<div class="empty-state" style="padding:1rem;grid-column:1/-1"><p>No scores in this set yet.</p></div>'}</div>
        ${addFromLib}
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
  el.innerHTML=filtered.map(sc=>scoreCardHTML(sc,{
    showEdit:eboardUnlocked, showAddToSet:eboardUnlocked,
    scoreIdx:library.indexOf(sc),
  })).join('')||`<div class="empty-state" style="grid-column:1/-1"><p>No scores match your search.</p></div>`;
  observePreviews(el);
}

// ── EBOARD PANEL ──────────────────────────────────────────
function renderEboard(){
  const listEl=document.getElementById('admin-session-list');
  listEl.innerHTML=sessions.map(sess=>`
    <div class="admin-session-row">
      <div>
        <span class="admin-session-num">${escHtml(sess.num)}</span>
        <span class="admin-session-name">${escHtml(sess.name)}</span>
      </div>
      <span class="admin-session-meta">${getSessionScores(sess).length} scores</span>
    </div>`).join('')||'<p class="small muted">No sets yet.</p>';
}

// ── LIB PICKER ────────────────────────────────────────────
function renderLibPicker(sessNum, term=''){
  const picker=document.getElementById(`lib-picker-${sessNum}`);
  if(!picker) return;
  const resultsEl=picker.querySelector('.lib-picker-results');
  const sess=sessions.find(s=>s.num===sessNum);
  if(!sess||!resultsEl) return;
  const inSet=new Set(sess.scoreUrls);
  const t=term.toLowerCase();
  const available=library.filter(sc=>{
    if(inSet.has(sc.url)) return false;
    return !t||sc.title.toLowerCase().includes(t)||composerDisplay(sc).toLowerCase().includes(t);
  });
  resultsEl.innerHTML=available.map(sc=>`
    <div class="lib-picker-card">
      <div class="lib-picker-title">${escHtml(sc.title)}</div>
      <div class="lib-picker-composer">${escHtml(composerDisplay(sc))}</div>
      <button class="btn-sm" data-pick-add data-sess="${escAttr(sessNum)}" data-url="${escAttr(sc.url)}">+ Add</button>
    </div>`).join('')||'<p class="small muted" style="padding:.4rem 0">All library scores are already in this set.</p>';
}

// ── EDIT MODAL ────────────────────────────────────────────
function openEditModal(scoreIdx){
  const score=library[scoreIdx]; if(!score) return;
  editTarget={scoreIdx};
  document.getElementById('edit-title').value=score.title;
  document.getElementById('edit-cfirst').value=score.composer_first;
  document.getElementById('edit-clast').value=score.composer_last;
  document.getElementById('edit-year').value=score.year;
  document.getElementById('edit-voicing').value=score.voicing;
  document.getElementById('edit-instr').value=score.instrumentation;
  document.getElementById('edit-url').value=score.url;
  document.getElementById('edit-status').textContent='';
  // Reset upload box
  const eb=document.getElementById('edit-upload-box');
  const el=document.getElementById('edit-upload-label');
  if(eb){ eb.classList.remove('has-file','uploading'); }
  if(el){ el.textContent='Replace PDF — drop here or click to browse'; }
  const es=document.getElementById('edit-upload-status');
  if(es){ es.textContent=''; es.className='admin-status'; }
  const sel=document.getElementById('edit-tags');
  Array.from(sel.options).forEach(o=>{ o.selected=score.tags.includes(o.value); });
  const modal=document.getElementById('edit-modal');
  modal.hidden=false; modal.classList.add('open');
  document.body.style.overflow='hidden';
  document.getElementById('edit-title').focus();
}
function closeEditModal(){
  const modal=document.getElementById('edit-modal');
  modal.classList.remove('open'); modal.hidden=true;
  document.body.style.overflow=''; editTarget=null;
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

// ── AUTH ──────────────────────────────────────────────────
function checkSavedAuth(){
  try{
    if(sessionStorage.getItem(LS_MB)==='1') memberUnlocked=true;
    if(sessionStorage.getItem(LS_EB)==='1'){ eboardUnlocked=true; memberUnlocked=true; }
  } catch{}
}
function showLibrary(){
  document.getElementById('lock-section').style.display='none';
  document.getElementById('library-section').style.display='block';
  if(eboardUnlocked) document.getElementById('tab-eboard').style.display='';
  renderThisWeek(); buildTagChips(); renderLibrary();
  if(eboardUnlocked) renderEboard();
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

// ── LOCK FORMS ────────────────────────────────────────────
function initLockForms(){
  document.getElementById('lock-form').addEventListener('submit',e=>{
    e.preventDefault();
    const pw=document.getElementById('lock-pw').value.trim();
    const errEl=document.getElementById('lock-error');
    if(pw===MEMBER_PASS||pw===EBOARD_PASS){
      memberUnlocked=true; try{sessionStorage.setItem(LS_MB,'1')}catch{}
      if(pw===EBOARD_PASS){ eboardUnlocked=true; try{sessionStorage.setItem(LS_EB,'1')}catch{} }
      errEl.textContent=''; showLibrary();
    } else { errEl.textContent='Incorrect password.'; }
  });
  document.getElementById('eboard-login-toggle').addEventListener('click',()=>{
    const f=document.getElementById('eboard-lock-form');
    f.style.display=f.style.display==='none'?'':'none';
    if(f.style.display!=='none') document.getElementById('eboard-pw').focus();
  });
  document.getElementById('eboard-lock-form').addEventListener('submit',e=>{
    e.preventDefault();
    const pw=document.getElementById('eboard-pw').value.trim();
    const errEl=document.getElementById('eboard-lock-error');
    if(pw===EBOARD_PASS){
      memberUnlocked=true; eboardUnlocked=true;
      try{sessionStorage.setItem(LS_MB,'1'); sessionStorage.setItem(LS_EB,'1')}catch{}
      errEl.textContent=''; showLibrary();
      setTimeout(()=>document.getElementById('tab-eboard')?.click(),50);
    } else { errEl.textContent='Incorrect E-Board password.'; }
  });
}

// ── UPLOAD VIA CLOUDFLARE WORKER ──────────────────────────
async function uploadPdfToGitHub(file){
  const form=new FormData();
  form.append('file', file, file.name);
  const res=await fetch(UPLOAD_WORKER_URL,{ method:'POST', body:form });
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error||`Upload failed (${res.status})`);
  return data.url;
}

function initGhToken(){ /* no-op — token lives in Cloudflare Worker secret */ }

function initUploadBox({ boxId, fileId, labelId, statusId, urlTargetId, defaultLabel }){
  const uploadBox=document.getElementById(boxId);
  const fileInput=document.getElementById(fileId);
  const labelText=document.getElementById(labelId);
  const statusEl=document.getElementById(statusId);
  const urlInput=document.getElementById(urlTargetId);
  if(!uploadBox||!fileInput) return;

  async function handleFile(file){
    if(!file) return;
    if(file.type!=='application/pdf'&&!file.name.endsWith('.pdf')){
      statusEl.textContent='Please select a PDF file.'; statusEl.className='admin-status err'; return;
    }
    labelText.textContent=file.name;
    uploadBox.classList.add('has-file','uploading');
    statusEl.textContent='Uploading…'; statusEl.className='admin-status';
    try{
      const url=await uploadPdfToGitHub(file);
      if(urlInput) urlInput.value=url;
      statusEl.textContent='Uploaded!'; statusEl.className='admin-status ok';
      uploadBox.classList.remove('uploading');
    } catch(err){
      statusEl.textContent=`Upload failed: ${err.message}`; statusEl.className='admin-status err';
      uploadBox.classList.remove('uploading','has-file');
      labelText.textContent=defaultLabel;
      fileInput.value='';
    }
  }

  fileInput.addEventListener('change',()=>handleFile(fileInput.files[0]));

  uploadBox.addEventListener('click',e=>{
    if(e.target===uploadBox||e.target.classList.contains('upload-icon')||e.target.classList.contains('upload-sub'))
      fileInput.click();
  });

  uploadBox.addEventListener('dragover',e=>{ e.preventDefault(); e.stopPropagation(); uploadBox.classList.add('drag-over'); });
  uploadBox.addEventListener('dragleave',e=>{ e.preventDefault(); e.stopPropagation(); uploadBox.classList.remove('drag-over'); });
  uploadBox.addEventListener('drop',e=>{
    e.preventDefault(); e.stopPropagation();
    uploadBox.classList.remove('drag-over');
    handleFile(e.dataTransfer.files[0]);
  });

  return { reset(){ uploadBox.classList.remove('has-file','uploading'); labelText.textContent=defaultLabel; fileInput.value=''; statusEl.textContent=''; statusEl.className='admin-status'; } };
}

function initPdfUpload(){
  const box=initUploadBox({
    boxId:'upload-box', fileId:'score-file',
    labelId:'upload-label-text', statusId:'upload-status',
    urlTargetId:'score-url',
    defaultLabel:'Drop a PDF here or click to browse',
  });
  // Expose reset for form clear after submit
  window._uploadBoxReset=box?.reset;
}

// ── ADMIN FORMS ───────────────────────────────────────────
function initAdminForms(){
  // Add score to library
  document.getElementById('add-score-form').addEventListener('submit',e=>{
    e.preventDefault();
    const statusEl=document.getElementById('add-score-status');
    const title=document.getElementById('score-title').value.trim();
    const url=document.getElementById('score-url').value.trim();
    if(!title||!url){ statusEl.textContent='Title and URL are required.'; statusEl.className='admin-status err'; return; }
    if(library.find(s=>s.url===url)){ statusEl.textContent='A score with that URL already exists.'; statusEl.className='admin-status err'; return; }
    library.push({
      title, url,
      composer_first:document.getElementById('score-cfirst').value.trim(),
      composer_last:document.getElementById('score-clast').value.trim(),
      year:document.getElementById('score-year').value.trim(),
      voicing:document.getElementById('score-voicing').value,
      instrumentation:document.getElementById('score-instr').value.trim(),
      tags:getSelectedTags(document.getElementById('score-tags')),
    });
    saveAll();
    statusEl.textContent='Score added to library.'; statusEl.className='admin-status ok';
    e.target.reset();
    if(window._uploadBoxReset) window._uploadBoxReset();
    buildTagChips(); renderLibrary(); renderThisWeek();
  });

  // Create new set
  document.getElementById('new-session-form').addEventListener('submit',e=>{
    e.preventDefault();
    const statusEl=document.getElementById('new-session-status');
    const num=document.getElementById('sess-num').value.trim();
    const name=document.getElementById('sess-name').value.trim();
    if(!num||!name){ statusEl.textContent='ID and name are required.'; statusEl.className='admin-status err'; return; }
    if(sessions.find(s=>s.num===num)){ statusEl.textContent=`${num} already exists.`; statusEl.className='admin-status err'; return; }
    sessions.unshift({num,name,scoreUrls:[]});
    saveAll();
    statusEl.textContent='Set created.'; statusEl.className='admin-status ok';
    e.target.reset(); renderThisWeek(); renderEboard();
  });

  // Edit score form
  document.getElementById('edit-score-form').addEventListener('submit',e=>{
    e.preventDefault();
    if(!editTarget) return;
    const {scoreIdx}=editTarget;
    const statusEl=document.getElementById('edit-status');
    const title=document.getElementById('edit-title').value.trim();
    const url=document.getElementById('edit-url').value.trim();
    if(!title||!url){ statusEl.textContent='Title and URL are required.'; statusEl.className='admin-status err'; return; }
    const oldUrl=library[scoreIdx].url;
    library[scoreIdx]={
      title,url,
      composer_first:document.getElementById('edit-cfirst').value.trim(),
      composer_last:document.getElementById('edit-clast').value.trim(),
      year:document.getElementById('edit-year').value.trim(),
      voicing:document.getElementById('edit-voicing').value,
      instrumentation:document.getElementById('edit-instr').value.trim(),
      tags:getSelectedTags(document.getElementById('edit-tags')),
    };
    // Update URL references in sets if URL changed
    if(oldUrl!==url){
      sessions.forEach(s=>{
        const i=s.scoreUrls.indexOf(oldUrl);
        if(i>-1) s.scoreUrls[i]=url;
      });
    }
    saveAll();
    statusEl.textContent='Saved.'; statusEl.className='admin-status ok';
    setTimeout(closeEditModal,600);
    buildTagChips(); renderLibrary(); renderThisWeek();
  });

  // Edit modal — replace PDF upload box
  initUploadBox({
    boxId:'edit-upload-box', fileId:'edit-score-file',
    labelId:'edit-upload-label', statusId:'edit-upload-status',
    urlTargetId:'edit-url',
    defaultLabel:'Replace PDF — drop here or click to browse',
  });

  document.getElementById('edit-modal-close').addEventListener('click',closeEditModal);
  document.getElementById('edit-modal-cancel').addEventListener('click',closeEditModal);
  document.getElementById('edit-modal').addEventListener('click',e=>{ if(e.target===e.currentTarget) closeEditModal(); });
}

// ── DELEGATED EVENTS ──────────────────────────────────────
function initDelegates(){
  document.addEventListener('click',e=>{
    const pdfBtn=e.target.closest('[data-open-pdf]');
    if(pdfBtn){ openPDF(pdfBtn.dataset.url,pdfBtn.dataset.title); return; }

    const editBtn=e.target.closest('[data-edit-score]');
    if(editBtn){ openEditModal(parseInt(editBtn.dataset.idx,10)); return; }

    const delBtn=e.target.closest('[data-delete-score]');
    if(delBtn){
      const el=document.getElementById(`del-confirm-${delBtn.dataset.idx}`);
      if(el) el.style.display=''; return;
    }
    const confirmBtn=e.target.closest('[data-confirm-delete]');
    if(confirmBtn){
      const idx=parseInt(confirmBtn.dataset.idx,10);
      const url=library[idx]?.url;
      library.splice(idx,1);
      if(url) sessions.forEach(s=>{ s.scoreUrls=s.scoreUrls.filter(u=>u!==url); });
      saveAll(); buildTagChips(); renderLibrary(); renderThisWeek(); renderEboard(); return;
    }
    const cancelBtn=e.target.closest('[data-cancel-delete]');
    if(cancelBtn){
      const el=document.getElementById(`del-confirm-${cancelBtn.dataset.idx}`);
      if(el) el.style.display='none'; return;
    }

    // Add to Set toggle
    const atsBtn=e.target.closest('[data-toggle-ats]');
    if(atsBtn){
      const panel=document.getElementById(`ats-${atsBtn.dataset.uid}`);
      if(panel) panel.style.display=panel.style.display==='none'?'':'none'; return;
    }
    // Do Add to Set
    const doAts=e.target.closest('[data-do-add-to-set]');
    if(doAts){
      const panel=doAts.closest('.add-to-set-panel');
      const sel=panel?.querySelector('.ats-select');
      const msg=panel?.querySelector('.ats-msg');
      const sessNum=sel?.value;
      if(!sessNum){ if(msg) msg.textContent='Choose a set.'; return; }
      const sess=sessions.find(s=>s.num===sessNum);
      if(!sess) return;
      if(sess.scoreUrls.includes(doAts.dataset.url)){
        if(msg) msg.textContent='Already in that set.'; return;
      }
      sess.scoreUrls.push(doAts.dataset.url); saveAll();
      if(msg){ msg.textContent='Added!'; setTimeout(()=>{ msg.textContent=''; },2000); }
      renderThisWeek(); return;
    }

    // Remove from set
    const removeBtn=e.target.closest('[data-remove-from-set]');
    if(removeBtn){
      const {sess,url}=removeBtn.dataset;
      const s=sessions.find(x=>x.num===sess);
      if(s){ s.scoreUrls=s.scoreUrls.filter(u=>u!==url); saveAll(); renderThisWeek(); } return;
    }

    // Session edit toggle
    const sessEditBtn=e.target.closest('[data-sess-edit]');
    if(sessEditBtn){
      const form=document.getElementById(`sess-edit-${sessEditBtn.dataset.sess}`);
      if(form) form.style.display=form.style.display==='none'?'':'none'; return;
    }
    const sessEditCancel=e.target.closest('[data-sess-edit-cancel]');
    if(sessEditCancel){
      const form=document.getElementById(`sess-edit-${sessEditCancel.dataset.sess}`);
      if(form) form.style.display='none'; return;
    }
    const sessSave=e.target.closest('[data-sess-save]');
    if(sessSave){
      const old=sessSave.dataset.sess;
      const newNum=document.getElementById(`edit-snum-${old}`)?.value.trim();
      const newName=document.getElementById(`edit-sname-${old}`)?.value.trim();
      const sess=sessions.find(s=>s.num===old);
      if(sess&&newNum&&newName){ sess.num=newNum; sess.name=newName; saveAll(); renderThisWeek(); renderEboard(); } return;
    }
    const sessDelBtn=e.target.closest('[data-sess-delete]');
    if(sessDelBtn){
      if(!confirm(`Delete set "${sessDelBtn.dataset.sess}"? Scores stay in the library.`)) return;
      sessions=sessions.filter(s=>s.num!==sessDelBtn.dataset.sess);
      saveAll(); renderThisWeek(); renderEboard(); return;
    }

    // Lib picker
    const showPicker=e.target.closest('[data-show-lib-picker]');
    if(showPicker){
      const sessNum=showPicker.dataset.sess;
      const picker=document.getElementById(`lib-picker-${sessNum}`);
      if(picker){
        const visible=picker.style.display!=='none';
        picker.style.display=visible?'none':'block';
        if(!visible) renderLibPicker(sessNum,'');
      } return;
    }
    const pickAdd=e.target.closest('[data-pick-add]');
    if(pickAdd){
      const {sess,url}=pickAdd.dataset;
      const s=sessions.find(x=>x.num===sess);
      if(s&&!s.scoreUrls.includes(url)){ s.scoreUrls.push(url); saveAll(); }
      const search=document.getElementById(`lib-picker-${sess}`)?.querySelector('.lib-picker-search');
      renderLibPicker(sess,search?.value||'');
      renderThisWeek(); return;
    }
  });

  document.addEventListener('input',e=>{
    if(e.target.classList.contains('lib-picker-search')){
      const picker=e.target.closest('.lib-picker');
      const sessNum=picker?.id.replace('lib-picker-','');
      if(sessNum) renderLibPicker(sessNum,e.target.value);
    }
  });

  document.getElementById('pdf-modal-close').addEventListener('click',closePDF);
  document.getElementById('pdf-close-btn').addEventListener('click',closePDF);
  document.getElementById('pdf-modal').addEventListener('click',e=>{ if(e.target===e.currentTarget) closePDF(); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ closePDF(); closeEditModal(); } });
}

// ── SEARCH ────────────────────────────────────────────────
function initSearch(){
  document.getElementById('lib-search').addEventListener('input',e=>{
    libSearchTerm=e.target.value; renderLibrary();
  });
}

// ── BOOT ──────────────────────────────────────────────────
async function init(){
  let parsed={library:[],sessions:[]};
  try{
    const res=await fetch(DAT_URL,{cache:'no-cache'});
    if(res.ok) parsed=parseDat(await res.text());
  } catch{}
  const merged=mergeLocal(parsed);
  library=merged.library; sessions=merged.sessions;
  checkSavedAuth();
  initPreviewObserver(); initTabs(); initDelegates();
  initLockForms(); initAdminForms(); initSearch();
  initGhToken(); initPdfUpload();
  if(memberUnlocked) showLibrary();
}

document.addEventListener('DOMContentLoaded',init);
})();
