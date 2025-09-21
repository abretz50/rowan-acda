async function loadEvents(){
  // Prefer local JSON for portability; swap to CSV/Sheets if desired.
  const res = await fetch('/data/events.json');
  const events = await res.json();
  return events.map(e => ({
    ...e,
    dateObj: new Date(e.date.replace(' ', 'T'))
  })).sort((a,b)=> a.dateObj - b.dateObj);
}
function renderEvents(list){
  const grid = document.getElementById('events-grid');
  grid.innerHTML = '';
  if (!list.length){
    grid.innerHTML = '<p class="small">No events found.</p>';
    return;
  }
  for (const ev of list){
    const card = document.createElement('div');
    card.className = 'card event-card';
    const img = document.createElement('img'); img.loading = 'lazy';
    img.src = ev.image || '/assets/img/event-fallback.png';
    img.alt = ev.title;
    const h3 = document.createElement('h3'); h3.textContent = ev.title;
    const small = document.createElement('div');
    small.className = 'small';
    small.textContent = ev.dateObj.toLocaleString() + ' — ' + (ev.location || '');
    const tags = document.createElement('div');
    tags.className = 'tags';
    (ev.tags||[]).forEach(t => { const s=document.createElement('span'); s.className='tag'; s.textContent=t; tags.appendChild(s); });
    const btn = document.createElement('button'); btn.className='btn btn-outline'; btn.textContent='Details'; btn.setAttribute('data-modal', 'ev-'+btoa(ev.title).replace(/=/g,''));
    grid.append(card);
    card.append(img,h3,small,tags,btn);

    // modal
    const modal = document.createElement('div');
    modal.className = 'modal'; modal.id = 'ev-'+btoa(ev.title).replace(/=/g,'');
    modal.innerHTML = '<div class="dialog" tabindex="-1"><h3>'+ev.title+'</h3><p class="small">'+ small.textContent +'</p><p>'+ (ev.description||'') +'</p><div class="tags">'+tags.innerHTML+'</div><div style="margin-top:1rem"><button class="btn btn-outline" onclick="this.closest(\'.modal\').classList.remove(\'open\')">Close (Esc)</button></div></div>';
    document.body.appendChild(modal);
  }
}
function setupFilters(all){
  const q = document.getElementById('event-search');
  const chips = document.querySelectorAll('.chip');
  function apply(){
    const term = (q.value || '').toLowerCase().trim();
    const active = Array.from(chips).filter(c=>c.classList.contains('active')).map(c=>c.dataset.tag);
    const filtered = all.filter(ev => {
      const matchTerm = !term || (ev.title.toLowerCase().includes(term) || (ev.description||'').toLowerCase().includes(term) || (ev.location||'').toLowerCase().includes(term));
      const matchTag = !active.length || (ev.tags||[]).some(t => active.includes(t));
      return matchTerm && matchTag;
    });
    renderEvents(filtered);
  }
  q.addEventListener('input', apply);
  chips.forEach(c => c.addEventListener('click', ()=>{ c.classList.toggle('active'); apply(); }));
  apply();
}
window.addEventListener('DOMContentLoaded', async ()=>{
  const events = await loadEvents();
  setupFilters(events);
});