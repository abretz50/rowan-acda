
/* events.js — loads events from the E-Board portal and renders to #events-grid */

(function(){
  const EVENTS_URL = '/.netlify/functions/portal-events';
  const grid = document.getElementById('events-grid');
  const q = document.getElementById('event-search');
  const chipsWrap = document.getElementById('tag-chips');

  function formatDateRange(start, end){
    const dOpt = { month:'long', day:'numeric', year:'numeric' };
    const tOpt = { hour:'numeric', minute:'2-digit' };
    const dFmt = new Intl.DateTimeFormat('en-US', dOpt);
    const tFmt = new Intl.DateTimeFormat('en-US', tOpt);
    const same = start.toDateString()===end.toDateString();
    if(same) return dFmt.format(start) + ' • ' + tFmt.format(start) + '–' + tFmt.format(end);
    return dFmt.format(start) + ' ' + tFmt.format(start) + ' → ' + dFmt.format(end) + ' ' + tFmt.format(end);
  }

  function gcalLink(ev){
    const text = encodeURIComponent(ev.title || 'ACDA Event');
    const details = encodeURIComponent((ev.details || ev.description || '') + (ev.signinLink ? '\n\nRSVP: ' + ev.signinLink : ''));
    const location = encodeURIComponent(ev.location || '');
    const start = ev.startDateTime, end = ev.endDateTime;
    const dates = start.getFullYear() + String(start.getMonth()+1).padStart(2,'0') + String(start.getDate()).padStart(2,'0') + 'T' +
                  String(start.getHours()).padStart(2,'0') + String(start.getMinutes()).padStart(2,'0') + '00/' +
                  end.getFullYear() + String(end.getMonth()+1).padStart(2,'0') + String(end.getDate()).padStart(2,'0') + 'T' +
                  String(end.getHours()).padStart(2,'0') + String(end.getMinutes()).padStart(2,'0') + '00';
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text='+text+'&dates='+dates+'&ctz=America/New_York&details='+details+'&location='+location;
  }

  function badgeHTML(tags){
    return (tags||[]).map(t => '<span class="chip" aria-hidden="true">'+t+'</span>').join(' ');
  }

  function cardHTML(ev){
    const img = ev.imageUrl || '/assets/img/about.png';
    const btn = ev.signinLink ? '<a class="button" href="'+ev.signinLink+'" target="_blank" rel="noopener">RSVP</a>' : '';
    return (
      '<article class="card event-card">' +
        '<img src="'+img+'" alt="'+(ev.title||'Event photo')+'" loading="lazy">' +
        '<div class="card-body">' +
          '<h3>'+ (ev.title||'Untitled') +'</h3>' +
          '<p class="small"><strong>'+ (ev.datePretty||'') +'</strong>'+ (ev.location? ' • '+ev.location : '') +'</p>' +
          (ev.description ? '<p>'+ev.description+'</p>' : '') +
          '<div class="event-actions" style="display:flex;gap:.5rem;flex-wrap:wrap">' +
            '<a class="button" href="'+ gcalLink(ev) +'" target="_blank" rel="noopener">Add to Calendar</a>' +
            btn +
          '</div>' +
          '<div class="event-badges" style="margin-top:.5rem">'+ badgeHTML(ev.tags) +'</div>' +
        '</div>' +
      '</article>'
    );
  }

  let ALL_EVENTS = [];

  function render(list){
    list.sort((a,b)=> a.startDateTime - b.startDateTime);
    grid.innerHTML = list.map(cardHTML).join('\n');
  }

  function applyFilters(){
    const term = (q?.value||'').toLowerCase().trim();
    const activeTags = Array.from(chipsWrap?.querySelectorAll('.chip.active')||[]).map(c=>c.dataset.tag);
    const out = ALL_EVENTS.filter(ev => {
      const matchTerm = !term || (ev.title?.toLowerCase().includes(term) || (ev.location||'').toLowerCase().includes(term) || (ev.description||'').toLowerCase().includes(term));
      const matchTag = !activeTags.length || (ev.tags||[]).some(t => activeTags.includes(t));
      return matchTerm && matchTag;
    });
    render(out);
  }

  function wireUI(){
    q?.addEventListener('input', applyFilters);
    chipsWrap?.querySelectorAll('.chip').forEach(ch => ch.addEventListener('click', ()=>{ ch.classList.toggle('active'); applyFilters(); }));
  }

  function normalize(ev){
    const start = ev.start ? new Date(ev.start) : new Date();
    const end = ev.end ? new Date(ev.end) : new Date(start.getTime()+60*60*1000);
    return {
      id: ev.id,
      title: ev.title || '',
      datePretty: formatDateRange(start, end),
      location: ev.location || '',
      tags: ev.tags || [],
      description: ev.description || '',
      details: ev.description || '',
      signinLink: ev.signinLink || '',
      imageUrl: ev.imageUrl || '',
      startDateTime: start, endDateTime: end
    };
  }

  async function init(){
    try{
      const res = await fetch(EVENTS_URL, { cache: 'no-store' });
      const data = await res.json();
      if(!data.ok) throw new Error('Events API returned an error');
      ALL_EVENTS = (data.events || []).map(normalize).filter(ev => ev.title);
      wireUI();
      if(!ALL_EVENTS.length){
        grid.innerHTML = '<p class="small">No events to show yet. Check back soon.</p>';
      } else {
        applyFilters();
      }
    } catch(err){
      console.error('Failed to load events', err);
      grid.innerHTML = '<p class="small">Could not load events right now. Please try again later.</p>';
    }
  }

  window.addEventListener('DOMContentLoaded', init);
})();
