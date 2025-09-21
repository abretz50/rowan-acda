async function fetchEvents(){
  // Try CSV, then JSON
  try{
    const r = await fetch('/data/events.csv'); 
    if (r.ok){
      const txt = await r.text();
      const rows = txt.trim().split(/\r?\n/).map(r=>r.split(','));
      const head = rows.shift().map(h=>h.trim().toLowerCase());
      const list = rows.map(r=>{const o={}; r.forEach((v,i)=>o[head[i]]=v.trim()); return o;})
        .map(e=>({...e, dateObj:new Date((e.date||'').replace(' ','T'))}))
        .filter(e=>!isNaN(e.dateObj));
      list.sort((a,b)=>a.dateObj-b.dateObj);
      return list;
    }
  }catch(e){}
  const r = await fetch('/data/events.json');
  const data = await r.json();
  return data.map(e=>({...e, dateObj:new Date((e.date||'').replace(' ','T'))})).sort((a,b)=>a.dateObj-b.dateObj);
}
async function renderFeatured(){
  const root = document.getElementById('home-events');
  if(!root) return;
  const list = await fetchEvents();
  const now = new Date();
  const upcoming = list.filter(e=>e.dateObj>=now).slice(0,3);
  root.innerHTML = '';
  for (const ev of upcoming){
    const el = document.createElement('article');
    el.className = 'card';
    el.innerHTML = `
      <img src="${ev.image || '/assets/img/event-fallback.png'}" alt="${ev.title||'Event image'}" loading="lazy" decoding="async">
      <div class="meta">
        <div class="small">${ev.dateObj.toLocaleString()} • ${ev.location||''}</div>
        <h3 style="margin:.2rem 0 .3rem">${ev.title||''}</h3>
        <div class="tags">${(ev.tags||[]).map(t=>`<span class="tag">${t}</span>`).join(' ')}</div>
        <p class="small" style="margin-top:.4rem">${ev.description||''}</p>
      </div>`;
    root.appendChild(el);
  }
  if (upcoming.length === 0){
    root.innerHTML = '<p class="small">No upcoming events posted yet. Check back soon.</p>';
  }
}
window.addEventListener('DOMContentLoaded', renderFeatured);