async function getNextEvent(){
  // Try CSV first if present
  try{
    const r = await fetch('/data/events.csv');
    if (r.ok){
      const txt = await r.text();
      const rows = txt.trim().split(/\r?\n/).map(r=>r.split(','));
      const head = rows.shift().map(h=>h.trim().toLowerCase());
      const list = rows.map(r => { const o={}; r.forEach((v,i)=>o[head[i]]=v.trim()); return o; })
        .map(e => ({...e, dateObj: new Date((e.date||'').replace(' ','T'))}))
        .filter(e => !isNaN(e.dateObj));
      list.sort((a,b)=> a.dateObj - b.dateObj);
      const now = new Date();
      return list.find(e=>e.dateObj >= now) || list[0];
    }
  }catch(e){}
  // Fallback to JSON
  try{
    const r = await fetch('/data/events.json'); 
    const data = await r.json();
    const list = data.map(e => ({...e, dateObj: new Date((e.date||'').replace(' ','T'))})).sort((a,b)=> a.dateObj - b.dateObj);
    const now = new Date();
    return list.find(e=>e.dateObj >= now) || list[0];
  }catch(e){}
  return null;
}

function renderBanner(ev){
  const wrap = document.getElementById('site-banner');
  if (!wrap || !ev) return;
  const key = 'bannerDismissed:' + (ev.title || 'x');
  try{ if(localStorage.getItem(key)) return; }catch(e){}
  wrap.innerHTML = `
    <div class="thumb">${ev.image ? `<img src="${ev.image}" alt="">` : ''}</div>
    <div class="body">
      <div class="badge">Upcoming</div>
      <div class="title">${ev.title||'Event'}</div>
      <div class="meta">${ev.dateObj ? ev.dateObj.toLocaleString() : ''} ${ev.location? '— '+ev.location: ''}</div>
    </div>
    <div class="actions">
      <a class="btn" href="/events.html">Details</a>
      <button class="close" aria-label="Dismiss announcement">Dismiss</button>
    </div>`;
  wrap.classList.remove('hidden');
  const btn = wrap.querySelector('.close');
  btn?.addEventListener('click', ()=>{
    wrap.classList.add('hidden');
    try{ localStorage.setItem(key, '1'); }catch(e){}
  });
}

window.addEventListener('DOMContentLoaded', async ()=>{
  const ev = await getNextEvent();
  renderBanner(ev);
});