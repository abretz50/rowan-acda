// guard
function guard(){
    if(!window.netlifyIdentity) return;
    const bounce = ()=>location.replace('account.html');
    netlifyIdentity.on('init', u=>{
      if(!u) return bounce();
      const roles = u.app_metadata?.roles || [];
      if(!(roles.includes('admin')||roles.includes('eboard'))) bounce();
    });
    netlifyIdentity.on('logout', bounce);
    netlifyIdentity.init();
  }
  guard();
  
  document.getElementById('logoutBtn')?.addEventListener('click',()=>netlifyIdentity.logout());
  
  // auth header (null-safe)
  async function authHeaders(){
    const ni = window.netlifyIdentity;
    if(!ni || typeof ni.currentUser !== 'function') return {};
    const u = ni.currentUser(); if(!u) return {};
    return { Authorization: `Bearer ${await u.jwt()}` };
  }
  
  // create
  document.getElementById('createForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = id => document.getElementById(id).value.trim();
    const int = id => parseInt(document.getElementById(id).value || '0', 10);
    const iso = id => {
      const el = document.getElementById(id);
      return el && el.value ? new Date(el.value).toISOString() : null;
    };
  
    let photo_url = v('photo'); // fallback to manual URL
    const fileInput = document.getElementById('photoFile');
    const file = fileInput && fileInput.files && fileInput.files[0];
  
    if (file) {
      const fd = new FormData();
      fd.append('file', file);
  
      let headers = {};
      const u = window.netlifyIdentity?.currentUser && window.netlifyIdentity.currentUser();
      if (u) {
        const token = await u.jwt();
        headers.Authorization = `Bearer ${token}`;
      }
  
      const up = await fetch('/.netlify/functions/upload-image', { method: 'POST', body: fd, headers });
      if (!up.ok) {
        const msg = await up.text();
        alert('Image upload failed: ' + msg);
        return;
      }
      const { url } = await up.json();
      photo_url = url;
    }
  
    const body = {
      title: v('title'),
      brief: v('brief'),
      full_description: v('full'),
      starts_at: iso('startsAt'),
      ends_at: iso('endsAt'),
      location: v('location'),
      points_value: int('points'),
      volunteers_per_slot: int('vps'),
      slot_minutes: int('slotMin'),
      photo_url
    };
  
    const res = await fetch('/.netlify/functions/events-admin', {
      method: 'POST',
      headers: { 'content-type':'application/json', ...(await authHeaders()) },
      body: JSON.stringify(body)
    });
    if(!res.ok){
      const msg = await res.text().catch(()=>'');
      alert('Create failed' + (msg ? (': ' + msg) : ''));
      return;
    }
    e.target.reset();
    document.getElementById('photo').value = '';
    if (fileInput) fileInput.value = '';
    loadEvents();
  });
  
  document.getElementById('refreshBtn')?.addEventListener('click', loadEvents);
  
  function v(id){ return document.getElementById(id).value.trim(); }
  function int(id){ return parseInt(document.getElementById(id).value||'0',10); }
  function iso(id){ const el=document.getElementById(id); return el && el.value ? new Date(el.value).toISOString():null; }
  
  async function loadEvents(){
    const wrap = g('eventsList'); wrap.innerHTML='Loading…';
    const r = await fetch('/.netlify/functions/events-get'); const items = await r.json();
    wrap.innerHTML = (items||[]).map(renderEvent).join('');
    wireEventCards();
  }
  function renderEvent(e){
    // events-get currently returns: id, title, summary, starts_at
    // Fallbacks so the UI doesn't show "undefined"
    const brief = e.brief ?? e.summary ?? '';
    const fullDesc = e.full_description ?? '';
    return `<div class="card" data-id="${e.id}">
      <div class="aspect">${e.photo_url?`<img src="${e.photo_url}" alt="">`:''}</div>
      <h3 contenteditable data-field="title">${h(e.title||'')}</h3>
      <p class="muted">${h(e.location||'')}</p>
      <p contenteditable data-field="brief">${h(brief)}</p>
      <p contenteditable data-field="full_description">${h(fullDesc)}</p>
      <div class="cards" style="margin-top:8px">
        <div class="card"><label>Starts<input data-field="starts_at" value="${e.starts_at||''}"></label></div>
        <div class="card"><label>Ends<input data-field="ends_at" value="${e.ends_at||''}"></label></div>
        <div class="card"><label>Points<input data-field="points_value" value="${e.points_value||0}"></label></div>
        <div class="card"><label>Vols/slot<input data-field="volunteers_per_slot" value="${e.volunteers_per_slot||0}"></label></div>
        <div class="card"><label>Slot min<input data-field="slot_minutes" value="${e.slot_minutes||30}"></label></div>
        <div class="card"><label>Photo URL<input data-field="photo_url" value="${h(e.photo_url||'')}"></label></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-primary" data-action="save">Save</button>
        <button class="btn btn-ghost" data-action="delete">Delete</button>
      </div>
    </div>`;
  }
  function wireEventCards(){
    qAll('#eventsList .card [data-action="save"]').forEach(b=>b.addEventListener('click',saveEvent));
    qAll('#eventsList .card [data-action="delete"]').forEach(b=>b.addEventListener('click',deleteEvent));
  }
  async function saveEvent(e){
    const card = e.target.closest('.card'), id=card.dataset.id;
    const body = collect(card); body.id=id;
    const r = await fetch('/.netlify/functions/events-admin',{
      method:'PUT',
      headers:{'content-type':'application/json',...(await authHeaders())},
      body:JSON.stringify(body)
    });
    if(!r.ok){ alert('Save failed'); return; }
    loadEvents();
  }
  async function deleteEvent(e){
    const card = e.target.closest('.card'), id=card.dataset.id;
    if(!confirm('Delete this event?')) return;
    const r = await fetch('/.netlify/functions/events-admin',{
      method:'DELETE',
      headers:{'content-type':'application/json',...(await authHeaders())},
      body:JSON.stringify({id})
    });
    if(!r.ok){ alert('Delete failed'); return; }
    card.remove();
  }
  function collect(card){
    const o={};
    qAll('[data-field]', card).forEach(el=>{
      const k=el.getAttribute('data-field'); let val = ('value' in el)?el.value:el.textContent.trim();
      if(['points_value','volunteers_per_slot','slot_minutes'].includes(k)) val = parseInt(val||'0',10);
      o[k]=val||null;
    }); return o;
  }
  async function loadPending(){
    const wrap=g('pendingList'); wrap.innerHTML='Loading…';
    const r = await fetch('/.netlify/functions/signups-admin',{
      method:'GET',
      headers:{'content-type':'application/json',...(await authHeaders())}
    });
    const items = await r.json();
    wrap.innerHTML = (items||[]).map(s=>`
      <div class="card" data-id="${s.id}">
        <label><input type="checkbox" class="sel"> ${h(s.title)} — ${h(s.kind)} (${h(s.status)})</label>
        <p class="muted">Default points: ${s.points_value ?? 0}</p>
        <label>Override points <input class="override" type="number" min="0"></label>
        <label>Comment <input class="comment"></label>
      </div>`).join('');
  }
  g('approveSelected')?.addEventListener('click',()=>submitPending(true));
  g('denySelected')?.addEventListener('click',()=>submitPending(false));
  async function submitPending(approve){
    const cards = qAll('#pendingList .card').filter(c=>c.querySelector('.sel')?.checked);
    if(!cards.length) return alert('Select at least one');
    const decisions = cards.map(c=>({ signup_id: c.dataset.id, approve, points_override: num(c.querySelector('.override')?.value), comment: c.querySelector('.comment')?.value || null }));
    const r = await fetch('/.netlify/functions/signups-admin',{
      method:'POST',
      headers:{'content-type':'application/json',...(await authHeaders())},
      body:JSON.stringify({decisions})
    });
    if(!r.ok){ alert('Failed'); return; }
    loadPending();
  }
  function num(v){ const n=parseInt(v||''); return isNaN(n)?undefined:n; }
  function h(s){return (s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
  const g=id=>document.getElementById(id); const qAll=(sel,root=document)=>Array.from(root.querySelectorAll(sel));
  loadEvents(); loadPending();
  