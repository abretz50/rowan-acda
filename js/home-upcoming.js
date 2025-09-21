async function injectUpcoming(){
  try{
    const res = await fetch('/data/events.json');
    const events = (await res.json()).map(e => ({...e, dateObj: new Date(e.date.replace(' ','T'))})).sort((a,b)=> a.dateObj - b.dateObj);
    const now = new Date();
    const next = events.find(e => e.dateObj >= now) || events[0];
    if (!next) return;
    const el = document.getElementById('home-upcoming');
    if(!el) return;
    el.removeAttribute('data-fallback');
    el.innerHTML = `
      <div class="card-media">${next.image ? `<img src="${next.image}" alt="${next.title}" loading="lazy" decoding="async">` : `<img src="/assets/img/event-fallback.png" alt="Event image">`}</div>
      <div class="card-body">
        <h3>${next.title}</h3>
        <p class="small">${next.dateObj.toLocaleString()} — ${next.location||''}</p>
        <div class="tags">${(next.tags||[]).map(t=>`<span class="tag">${t}</span>`).join(' ')}</div>
        <p style="margin:.5rem 0 0">${next.description||''}</p>
        <p style="margin-top:.75rem"><a class="btn btn-link" href="/events.html">See details</a></p>
      </div>`;


  }catch(e){ /* no-op */ }
}
window.addEventListener('DOMContentLoaded', injectUpcoming);