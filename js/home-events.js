/* Home page: show the next 3 upcoming events */
(function(){
  const PRIMARY_CSV = "/assets/data/events.csv";
  const BACKUP_CSV  = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQgnEZCsF6om55MFRpD3Dy3xLNF0nSO7U228ijGXkZGSGPpZMqGitInVmgi6y8cYF56mEK8GOuGl0D7/pub?gid=0&single=true&output=csv";

  async function fetchCSV(){
    const isIOS = /iP(hone|ad|od)/i.test(navigator.userAgent);
    const isMobileSafari = isIOS && /Safari/i.test(navigator.userAgent) && !/CriOS|FxiOS/i.test(navigator.userAgent);
    const ctl = new AbortController();
    const t = setTimeout(()=>ctl.abort(), 10000);
    const baseOpts = {
      mode: 'cors', credentials: 'omit', signal: ctl.signal,
      ...(isMobileSafari ? {} : { cache: 'no-cache' })
    };
    async function get(url){ const r = await fetch(url, baseOpts); if(!r.ok) throw new Error("HTTP "+r.status); return r.text(); }
    try{ const txt = await get(PRIMARY_CSV); clearTimeout(t); return txt; }
    catch { try { return await get(BACKUP_CSV); } finally { clearTimeout(t); } }
  }

  const listEl = document.getElementById('home-events');

  function parseCSV(text){
    const rows = []; let i=0, field='', row=[], inQuotes=false;
    while(i < text.length){
      const c = text[i];
      if(inQuotes){
        if(c === '"'){ if(text[i+1] === '"'){ field += '"'; i++; } else inQuotes = false; }
        else field += c;
      } else {
        if(c === '"') inQuotes = true;
        else if(c === ','){ row.push(field); field=''; }
        else if(c === '\n'){ row.push(field); field=''; rows.push(row); row=[]; }
        else if(c === '\r'){ /* ignore */ }
        else field += c;
      }
      i++;
    }
    if(field.length || row.length){ row.push(field); rows.push(row); }
    return rows;
  }
  function toRecords(rows){
    if(!rows.length) return [];
    const header = rows.shift().map(h=>h.trim().toLowerCase());
    return rows.map(r=>{ const o={}; header.forEach((h,i)=> o[h]=(r[i]||'').trim()); return o; });
  }

  function parseDate(dStr){
    if(!dStr) return null;
    const s = dStr.trim();
    const m = s.match(/^(\d{1,2})[\/\.-](\d{1,2})(?:[\/\.-](\d{2,4}))?$/);
    if(!m) return null;
    let mm=+m[1], dd=+m[2], yy = m[3] ? +m[3] : (new Date()).getFullYear();
    if(yy<100) yy=2000+yy;
    return new Date(yy, mm-1, dd);
  }
  function parseTime(tStr){
    if(!tStr) return null;
    let s = String(tStr).trim().toLowerCase().replace(/[–—]/g, '-');
    if(/\bnoon\b/.test(s)) return {h:12,m:0};
    if(/\bmidnight\b/.test(s)) return {h:0,m:0};
    const m = s.match(/^\s*(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*([ap]\.?\s*m\.?)?\s*$/i);
    if(!m) return null;
    let h=parseInt(m[1],10), mm=m[2]?parseInt(m[2],10):0, ap=m[3]?m[3].replace(/\./g,'').trim():'';
    if(ap){ if(ap.startsWith('p') && h<12) h+=12; if(ap.startsWith('a') && h===12) h=0; }
    return {h, m:mm};
  }
  function parseTimeRange(s){
    if(!s) return null;
    let str = String(s).toLowerCase().replace(/[–—]/g,'-').replace(/\s+/g,' ').trim();
    const m = str.match(/^(.+?)\s*-\s*(.+)$/);
    if(!m) return null;
    let a = m[1].trim(), b = m[2].trim();
    const suffix = b.match(/\b([ap])\.?m\.?\b/);
    if(suffix && !/\b([ap])\.?m\.?\b/.test(a)) a += ' ' + suffix[0];
    const t1 = parseTime(a), t2 = parseTime(b);
    if(!t1 || !t2) return null;
    return {start:t1, end:t2};
  }
  function combineDateTime(d, t){ const dt=new Date(d); const time=t||{h:0,m:0}; dt.setHours(time.h,time.m,0,0); return dt; }
  function formatDateRange(start, end){
    const dOpt={month:'long',day:'numeric',year:'numeric'};
    const tOpt={hour:'numeric',minute:'2-digit'};
    const dFmt=new Intl.DateTimeFormat('en-US',dOpt), tFmt=new Intl.DateTimeFormat('en-US',tOpt);
    const same = start.toDateString()===end.toDateString();
    return same ? dFmt.format(start)+' • '+tFmt.format(start)+'–'+tFmt.format(end)
                : dFmt.format(start)+' '+tFmt.format(start)+' → '+dFmt.format(end)+' '+tFmt.format(end);
  }
  function tagSlug(s){ return (s||'').toLowerCase().replace(/\s+/g,'-'); }
  function normalizeTags(s){ return !s?[]: s.split(/[,;/|]+/).map(v=>v.trim()).filter(Boolean); }

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

  function buildEvents(recs){
    const now = new Date();
    return recs.map(r => {
      const date = parseDate(r.date || r.day || r.event_date);
      const stRaw = r.start_time || r.start || r.begin || '';
      const etRaw = r.end_time   || r.end   || r.finish || '';
      const rangeRaw = r.time || r.time_range || r.times || '';
      let st = parseTime(stRaw), et = parseTime(etRaw);
      if((!st || !et) && rangeRaw){ const rng = parseTimeRange(rangeRaw); if(rng){ st = st || rng.start; et = et || rng.end; } }
      const start = date ? combineDateTime(date, st || {h:0,m:0}) : new Date();
      let end = date ? (et ? combineDateTime(date, et) : new Date(start.getTime() + 60*60*1000)) : new Date(start.getTime() + 60*60*1000);
      if(end <= start){ end = rangeRaw ? new Date(end.getTime() + 24*60*60*1000) : new Date(start.getTime() + 60*60*1000); }
      const when = end < now ? 'past' : 'upcoming';
      const tags = normalizeTags(r.tags);
      return {
        id: Math.random().toString(36).slice(2),
        title: r.title || r.name || '', date: r.date, start_time: r.start_time, end_time: r.end_time,
        startDateTime: start, endDateTime: end, datePretty: formatDateRange(start, end),
        location: r.location || '', tags, tagSlugs: tags.map(tagSlug),
        description: r.description || '', details: r.details || '',
        signin_link: r.signin_link || r.rsvp || '',
        image_url: r.image_url || r.image || '/assets/img/about.png', when
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
      const csv = await fetchCSV();
      const all = buildEvents(toRecords(parseCSV(csv)));
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
