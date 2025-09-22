
/* Rebuilt events.js — loads Google Sheets CSV and renders to #events-grid */

(function(){
  const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQgnEZCsF6om55MFRpD3Dy3xLNF0nSO7U228ijGXkZGSGPpZMqGitInVmgi6y8cYF56mEK8GOuGl0D7/pub?gid=0&single=true&output=csv";
  const grid = document.getElementById('events-grid');
  const q = document.getElementById('event-search');
  const chipsWrap = document.getElementById('tag-chips');

  function parseCSV(text){
    const rows = [];
    let i=0, field='', row=[], inQuotes=false;
    while(i < text.length){
      const c = text[i];
      if(inQuotes){
        if(c === '"'){
          if(text[i+1] === '"'){ field += '"'; i++; }
          else { inQuotes = false; }
        } else { field += c; }
      } else {
        if(c === '"') inQuotes = true;
        else if(c === ','){ row.push(field); field=''; }
        else if(c === '\n'){ row.push(field); field=''; rows.push(row); row=[]; }
        else if(c === '\r'){ /* ignore */ }
        else { field += c; }
      }
      i++;
    }
    if(field.length || row.length){ row.push(field); rows.push(row); }
    return rows;
  }

  function toRecords(rows){
    const header = rows.shift().map(h => h.trim().toLowerCase());
    return rows.map(r => {
      const o = {};
      header.forEach((h, i) => o[h] = (r[i]||'').trim());
      return o;
    });
  }

  function parseDate(dStr){
    if(!dStr) return null;
    const p = dStr.split(/[\/-\.]/).map(s=>s.trim());
    if(p.length < 3) return null;
    let [m,d,y] = p;
    m = parseInt(m,10); d = parseInt(d,10); y = parseInt(y,10);
    if(y < 100) y = 2000 + y;
    return new Date(y, m-1, d);
  }
  function parseTime(tStr){
    if(!tStr) return {h:0,m:0};
    const m = tStr.trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)?$/i);
    if(!m) return {h:0,m:0};
    let h = parseInt(m[1],10), mm = parseInt(m[2],10);
    const ap = (m[3]||'').toUpperCase();
    if(ap==='PM' && h<12) h+=12;
    if(ap==='AM' && h===12) h=0;
    return {h, m:mm};
  }
  function combineDateTime(d, t){
    const dt = new Date(d); dt.setHours(t.h, t.m, 0, 0); return dt;
  }
  function formatDateRange(start, end){
    const dOpt = { month:'long', day:'numeric', year:'numeric' };
    const tOpt = { hour:'numeric', minute:'2-digit' };
    const dFmt = new Intl.DateTimeFormat('en-US', dOpt);
    const tFmt = new Intl.DateTimeFormat('en-US', tOpt);
    const same = start.toDateString()===end.toDateString();
    if(same) return dFmt.format(start) + ' • ' + tFmt.format(start) + '–' + tFmt.format(end);
    return dFmt.format(start) + ' ' + tFmt.format(start) + ' → ' + dFmt.format(end) + ' ' + tFmt.format(end);
  }
  function tagList(s){
    if(!s) return [];
    // support comma, slash, or pipe separators
    return s.split(/[\|,;/]+/).map(v=>v.trim()).filter(Boolean);
  }

  function gcalLink(ev){
    const text = encodeURIComponent(ev.title || 'ACDA Event');
    const details = encodeURIComponent((ev.details || ev.description || '') + (ev.signin_link ? '\n\nRSVP: ' + ev.signin_link : ''));
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
    const img = ev.image_url || ev.image || '/assets/img/about.png';
    const btn = ev.signin_link ? '<a class="button" href="'+ev.signin_link+'" target="_blank" rel="noopener">RSVP</a>' : '';
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

  function normalize(rec){
    const dateDT = parseDateTimeString(rec.date);
    const date = dateDT || parseDate(rec.date || rec.day || rec.event_date);
    const st = parseTime(rec.start_time || rec.start || rec.begin);
    const et = parseTime(rec.end_time || rec.end || rec.finish);
    const start = date? combineDateTime(date, st) : new Date();
    const end = date? combineDateTime(date, et.h? et : st) : new Date(start.getTime()+60*60*1000);
    return {
      id: Math.random().toString(36).slice(2),
      title: rec.title || rec.name || '',
      datePretty: date? formatDateRange(start, end) : '',
      location: rec.location || rec.place || '',
      tags: tagList(rec.tags),
      description: rec.description || rec.details || '',
      details: rec.details || '',
      signin_link: rec.signin_link || rec.rsvp || '',
      image_url: rec.image_url || rec.image || '',
      startDateTime: start, endDateTime: end
    };
  }

  async function fetchJSONFallback(){
    try{
      const r = await fetch('/data/events.json', {cache:'no-store'});
      if(!r.ok) throw new Error('events.json not found');
      const arr = await r.json();
      return arr.map(e => ({
        id: e.id || Math.random().toString(36).slice(2),
        title: e.title, datePretty: e.date, location: e.location,
        tags: e.tags, description: e.description, details: e.description,
        signin_link: e.signin_link || '', image_url: e.image,
        startDateTime: new Date(), endDateTime: new Date()
      }));
    } catch(err){ console.error('JSON fallback failed', err); return []; }
  }

  function parseDateTimeString(s){
    // Handles "M/D/YYYY H:MM AM/PM" in one cell
    if(!s) return null;
    const m = s.trim().match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})\s*([AP]M)?)?$/i);
    if(!m) return null;
    let mm = parseInt(m[1],10), dd = parseInt(m[2],10), yy = parseInt(m[3],10);
    if(yy < 100) yy = 2000 + yy;
    let h = parseInt(m[4]||'0',10), min = parseInt(m[5]||'0',10);
    const ap = (m[6]||'').toUpperCase();
    if(ap==='PM' && h<12) h+=12;
    if(ap==='AM' && h===12) h=0;
    return new Date(yy, mm-1, dd, h, min, 0, 0);
  }

  async function init(){
    try{
      const txt = await fetch(CSV_URL, {cache:'no-store'}).then(r=>r.text());
      const rows = parseCSV(txt);
      const recs = toRecords(rows);
      ALL_EVENTS = recs.map(normalize).filter(ev => ev.title);
      if(!ALL_EVENTS.length){
        console.warn('CSV parsed but no records found. Trying JSON fallback.');
        ALL_EVENTS = await fetchJSONFallback();
      }
      wireUI();
      if(!ALL_EVENTS.length){
        grid.innerHTML = '<p class="small">No events to show yet. Check back soon.</p>';
      } else {
        applyFilters();
      }
    } catch(err){
      console.error('Failed to load events CSV', err);
      grid.innerHTML = '<p class="small">Could not load events right now. Please try again later.</p>';
    }
  }

  window.addEventListener('DOMContentLoaded', init);
})();
