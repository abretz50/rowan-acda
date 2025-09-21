
// js/events-csv.js
// Render Events from Google Sheets CSV into #events-grid using your modern card styles.

const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-...ihQkWTMVlzk7nbWA3xE9g1orMChUo/pub?gid=0&single=true&output=csv";

function normalizeRow(row){
  const map = {
    "Title":"title","Date":"date","Time":"time","Location":"location","Tags":"tags",
    "Description":"description","Link":"link","Image":"image","ICS":"ics"
  };
  const out = {};
  for (const k in map){ out[map[k]] = (row[k]||"").trim(); }
  return out;
}

function startDateFrom(item){
  const d = new Date((item.date||"").trim());
  if (isNaN(d)) return new Date();
  // If time is like "7:30 PM–9:00 PM", take left side
  const t = (item.time||"").split("-")[0]?.trim();
  return new Date(`${item.date} ${t||""}`);
}

function formatDatePretty(mdy){
  const d = new Date(mdy);
  return isNaN(d) ? mdy : d.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric', year:'numeric' });
}

function renderEvents(items){
  const root = document.getElementById("events-grid");
  if (!root) return;
  if (!items.length){
    root.innerHTML = `<p class="muted">No upcoming events yet. Check back soon.</p>`;
    return;
  }
  const html = items.map(ev => {
    const datePretty = formatDatePretty(ev.date);
    const tagBadges = (ev.tags||"").split(",").map(s=>s.trim()).filter(Boolean).map(t=>`<span class="tag">${t}</span>`).join(" ");
    const img = ev.image ? `<img class="card-media" src="${ev.image}" alt="">` : "";
    const linkBtn = ev.link ? `<a class="btn btn-primary" href="${ev.link}" target="_blank" rel="noopener">Details</a>` : "";
    const icsBtn = ev.ics ? `<a class="btn btn-outline" href="${ev.ics}">Add to Calendar</a>` : "";
    return `
      <article class="card event-card">
        ${img}
        <div class="card-body">
          <h3 class="card-title">${ev.title||"Untitled Event"}</h3>
          <p class="muted">${datePretty}${ev.time?` • ${ev.time}`:""}${ev.location?` • ${ev.location}`:""}</p>
          ${ev.description?`<p>${ev.description}</p>`:""}
          <div class="card-actions">${linkBtn}${icsBtn}</div>
          ${tagBadges?`<div class="card-tags">${tagBadges}</div>`:""}
        </div>
      </article>`;
  }).join("");
  root.innerHTML = html;
}

async function fetchEvents(){
  const res = await fetch(SHEET_CSV_URL, { cache: "no-store" });
  const csv = await res.text();
  return new Promise((resolve) => {
    Papa.parse(csv, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data }) => {
        const items = data.map(normalizeRow)
          .filter(x => x.title || x.date)
          .sort((a,b)=> startDateFrom(a) - startDateFrom(b));
        resolve(items);
      }
    });
  });
}

(async () => {
  try{
    const items = await fetchEvents();
    renderEvents(items);
  }catch(err){
    console.error("Events CSV error:", err);
    const root = document.getElementById("events-grid");
    if (root) root.innerHTML = `<p>There was a problem loading events.</p>`;
  }
})();
