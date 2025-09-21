async function injectUpcoming(){
  try{
    const res = await fetch('/data/events.json');
    const events = (await res.json()).map(e => ({...e, dateObj: new Date(e.date.replace(' ','T'))})).sort((a,b)=> a.dateObj - b.dateObj);
    const now = new Date();
    const next = events.find(e => e.dateObj >= now) || events[0];
    if (!next) return;
    const el = document.getElementById('upcoming');
    
el.innerHTML = `<div class="card">
  ${next.image ? `<img src="${next.image}" alt="${next.title}" loading="lazy" style="border-radius:.75rem;aspect-ratio:16/9;object-fit:cover;margin-bottom:.5rem;border:1px solid var(--border)">` : ``}
  <h3>Next Up: ${next.title}</h3>
  <p class="small">${next.dateObj.toLocaleString()} — ${next.location||''}</p>
  <div class="tags">${(next.tags||[]).map(t=>`<span class="tag">${t}</span>`).join(' ')}</div>
  <p style="margin:.5rem 0 0">${next.description||''}</p>
  <p style="margin-top:.75rem"><a class="btn" href="/events.html">See all events</a></p>
</div>`;

  }catch(e){ /* no-op */ }
}
window.addEventListener('DOMContentLoaded', injectUpcoming);