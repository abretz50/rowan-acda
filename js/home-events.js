/* Home page: show the next 3 upcoming events, sourced from the E-Board portal */
(function(){
  const EVENTS_URL = '/.netlify/functions/portal-events';
  const listEl = document.getElementById('home-events');

  function formatDateRange(start, end){
    const dOpt={month:'long',day:'numeric',year:'numeric'};
    const tOpt={hour:'numeric',minute:'2-digit'};
    const dFmt=new Intl.DateTimeFormat('en-US',dOpt), tFmt=new Intl.DateTimeFormat('en-US',tOpt);
    const same = start.toDateString()===end.toDateString();
    return same ? dFmt.format(start)+' • '+tFmt.format(start)+'–'+tFmt.format(end)
                : dFmt.format(start)+' '+tFmt.format(start)+' → '+dFmt.format(end)+' '+tFmt.format(end);
  }
  function tagSlug(s){ return (s||'').toLowerCase().replace(/\s+/g,'-'); }

  function getBtnLabel(ev){
    const tags = new Set((ev.tagSlugs||[]).map(String));
    if (tags.has('volunteer')) return 'Sign up';
    if (tags.has('performance') || tags.has('performances')) return 'Tickets';
    if (tags.has('professional-development') || tags.has('event') || tags.has('events')) return 'Check in';
    return 'Attendance';
  }
  function gcalLink(ev){
    const text = encodeURIComponent(ev.title || 'ACDA Event');
    const details = encodeURIComponent((ev.details || ev.description || '') + (ev.signin_link ? '\n\nRSVP: ' + ev.signin_link : ''));
    const location = encodeURIComponent(ev.location || '');
    const tz = 'America/New_York';
    const s = ev.startDateTime, e = ev.endDateTime;
    const dates = s.getFullYear()+String(s.getMonth()+1).padStart(2,'0')+String(s.getDate()).padStart(2,'0')+'T'+
                  String(s.getHours()).padStart(2,'0')+String(s.getMinutes()).padStart(2,'0')+'00/'+
                  e.getFullYear()+String(e.getMonth()+1).padStart(2,'0')+String(e.getDate()).padStart(2,'0')+'T'+
                  String(e.getHours()).padStart(2,'0')+String(e.getMinutes()).padStart(2,'0')+'00';
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text='+text+'&dates='+dates+'&ctz='+tz+'&details='+details+'&location='+location;
  }
  function badgeHTML(tags){ return (tags||[]).map(t=>'<span class="badge" data-tag="'+tagSlug(t)+'">'+t+'</span>').join(' '); }

  function cardHTML(ev){
    const hasLink = !!ev.signin_link;
    const btnLabel = getBtnLabel(ev);
    const signinHref = hasLink ? ev.signin_link : '#';
    const img = ev.image_url || '/assets/img/about.png';
    return (
      '<article class="card" data-tags="'+ev.tagSlugs.join(' ')+'" data-when="'+ev.when+'">'+
        '<img src="'+img+'" alt="'+(ev.title||'Event photo')+'" loading="lazy" onerror="this.onerror=null;this.src=\'/assets/img/about.png\'">'+
        '<div class="meta">'+
          '<h3>'+(ev.title||'Untitled')+'</h3>'+
          '<p class="kicker event-meta"><strong>'+(ev.datePretty||'')+'</strong>'+
            (ev.location? ' • '+ev.location : '')+
            ' • <a class="calendar-link" href="'+gcalLink(ev)+'" target="_blank" rel="noopener">Add to Calendar</a>'+
          '</p>'+
          '<div class="event-badges" style="margin:.4rem 0 .4rem">'+badgeHTML(ev.tags)+'</div>'+
          (ev.description ? '<p>'+ev.description+'</p>' : '')+
          '<div class="event-actions" style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.6rem">'+
            '<a class="btn" data-action="signin" data-has-link="'+(hasLink?'1':'0')+'" href="'+signinHref+'" target="_blank" rel="noopener">'+btnLabel+'</a>'+
            '<button class="btn btn-outline" data-modal="modal-'+ev.id+'">Details</button>'+
          '</div>'+
        '</div>'+
      '</article>'
    );
  }

  function modalHTML(ev){
    const hasLink = !!ev.signin_link;
    const btnLabel = getBtnLabel(ev);
    const signinHref = hasLink ? ev.signin_link : '#';
    const img = ev.image_url || '/assets/img/about.png';
    return (
      '<div class="modal" id="modal-'+ev.id+'" role="dialog" aria-modal="true" aria-labelledby="modal-'+ev.id+'-title" hidden>'+
        '<div class="dialog" tabindex="-1">'+
          '<div class="modal-header" style="text-align:center;position:relative">'+
            '<h3 class="modal-title" id="modal-'+ev.id+'-title">'+(ev.title||'')+'</h3>'+
            '<button class="modal-close" type="button" data-close aria-label="Close">✕</button>'+
          '</div>'+
          '<section style="text-align:center">'+
            '<img class="convention-thumb" src="'+img+'" alt="'+(ev.title||'Event photo')+'" onerror="this.onerror=null;this.src=\'/assets/img/about.png\'">'+
            '<p class="kicker event-meta"><strong>'+(ev.datePretty||'')+'</strong>'+(ev.location? ' • '+ev.location : '')+'</p>'+
            (ev.details ? '<p>'+ev.details+'</p>' : '')+
            '<div style="display:flex;gap:.5rem;flex-wrap:wrap;justify-content:center;margin-top:1rem">'+
              '<a class="btn" data-action="signin" data-has-link="'+(hasLink?'1':'0')+'" href="'+signinHref+'" target="_blank" rel="noopener">'+btnLabel+'</a>'+
              '<a class="btn btn-outline" href="'+gcalLink(ev)+'" target="_blank" rel="noopener">Add to Calendar</a>'+
            '</div>'+
          '</section>'+
        '</div>'+
      '</div>'
    );
  }

  function buildEvents(apiEvents){
    const now = new Date();
    return apiEvents.map(ev => {
      const start = ev.start ? new Date(ev.start) : new Date();
      const end = ev.end ? new Date(ev.end) : new Date(start.getTime()+60*60*1000);
      const when = end < now ? 'past' : 'upcoming';
      const tags = ev.tags || [];
      return {
        id: ev.id, title: ev.title || '',
        startDateTime: start, endDateTime: end, datePretty: formatDateRange(start, end),
        location: ev.location || '', tags, tagSlugs: tags.map(tagSlug),
        description: ev.description || '', details: ev.description || '',
        signin_link: ev.signinLink || '',
        image_url: ev.imageUrl || '/assets/img/about.png', when
      };
    });
  }

  function openModal(m){ if(!m) return; m.hidden=false; m.classList.add('open'); document.body.style.overflow='hidden'; m.querySelector('.dialog')?.focus({preventScroll:true}); }
  function closeModal(m){ if(!m) return; m.classList.remove('open'); m.hidden=true; document.body.style.overflow=''; }

  function attachModalHandlers(){
    document.querySelectorAll('[data-modal]').forEach(btn=>{
      btn.addEventListener('click',()=> openModal(document.getElementById(btn.getAttribute('data-modal'))));
    });
    document.querySelectorAll('.modal').forEach(m=>{
      m.addEventListener('click',(e)=>{ if(e.target===m) closeModal(m); });
      m.querySelectorAll('[data-close]').forEach(b=> b.addEventListener('click',()=> closeModal(m)));
    });
    document.addEventListener('keydown',(e)=>{ if(e.key==='Escape') document.querySelectorAll('.modal.open').forEach(closeModal); });
  }

  function showNotice(){ openModal(document.getElementById('notice-modal')); }
  document.addEventListener('click',(e)=>{
    const a = e.target.closest('a[data-action="signin"]');
    if(!a) return;
    const hasLink = a.getAttribute('data-has-link') === '1';
    const href = a.getAttribute('href');
    if(!hasLink || !href || href === '#'){ e.preventDefault(); showNotice(); }
  });

  function render(events){
    if(!events.length){ listEl.innerHTML = '<p class="kicker">No upcoming events yet. Check back soon!</p>'; return; }
    listEl.innerHTML = events.map(cardHTML).join('\n') + '\n' + events.map(modalHTML).join('\n');
    attachModalHandlers();
  }

  async function init(){
    if(!listEl.innerHTML.trim()){ listEl.innerHTML = '<p class="kicker">Loading events…</p>'; }
    try{
      const res = await fetch(EVENTS_URL, { cache: 'no-store' });
      const data = await res.json();
      if(!data.ok) throw new Error('Events API returned an error');
      const all = buildEvents(data.events || []);
      const upcoming = all.filter(ev => ev.when === 'upcoming').sort((a,b)=> a.startDateTime - b.startDateTime).slice(0,3);
      render(upcoming);
    } catch(err){
      console.error('Home events load failed:', err);
      listEl.innerHTML = '<div class="card"><div class="card-body"><p class="kicker">Couldn\'t load events on this device.</p><button class="btn" id="retry-home-events">Try again</button></div></div>';
      document.getElementById('retry-home-events')?.addEventListener('click', init, { once:true });
    }
  }

  window.addEventListener('DOMContentLoaded', init);
})();
