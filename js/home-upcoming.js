/* /js/home-upcoming.js
   - Pulls events from the same Google Sheet CSV as events.js
   - Picks the next upcoming event (>= now, local time)
   - Renders a compact card into #home-upcoming
*/
(() => {
  const SHEET_CSV_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vSESaEnsqhseKRcrAkMj0Gu-gEAzHjYYdfTlpkAxaUVyUl6MERihQkWTMVlzk7nbWA3xE9g1orMChUo/pub?gid=0&single=true&output=csv";
  const IMG_FALLBACK = "/assets/images/event-placeholder.png"; // adjust if needed

  const $ = (sel) => document.querySelector(sel);

  function normalizeRow(row) {
    const out = {};
    for (const k in row) {
      const key = String(k || "").trim().toLowerCase().replace(/\s+/g, "_");
      out[key] = row[k];
    }
    return out;
  }

  function parseStartDate(item) {
    const dateStr = (item.date || "").trim();
    const timeToken = (item.time || "").split("-")[0]?.trim() || "";
    // Normalize common time formats (e.g., '3pm' -> '3:00 pm')
    let timeNorm = timeToken;
    if (timeToken && /^\d{1,2}(am|pm)$/i.test(timeToken)) {
      timeNorm = timeToken.replace(/(am|pm)$/i, ":00 $1");
    }
    const composed = dateStr ? `${dateStr} ${timeNorm || "00:00"}` : "";
    const dt = new Date(composed);
    return isNaN(dt) ? new Date(dateStr) : dt;
  }

  function formatDatePretty(mdy) {
    const d = new Date(mdy);
    if (isNaN(d)) return mdy || "";
    return d.toLocaleDateString(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function pickNextEvent(events) {
    const now = new Date();
    const sorted = [...events].sort((a, b) => parseStartDate(a) - parseStartDate(b));
    const upcoming = sorted.find((e) => parseStartDate(e) >= now);
    return upcoming || sorted[sorted.length - 1] || null;
  }

  function renderHomeUpcoming(evt) {
    const mount = $("#home-upcoming");
    if (!mount) return;
    const img = evt.image || IMG_FALLBACK;
    const datePretty = formatDatePretty(evt.date);
    const timeLabel = evt.time ? ` • ${evt.time}` : "";
    const typeBadge = evt.type ? `<span class="chip" aria-label="Event type">${evt.type}</span>` : "";

    mount.removeAttribute("data-fallback");
    mount.innerHTML = `
      <div class="card-media">
        <img loading="lazy" src="${img}" alt="${(evt.title || "Upcoming event").replace(/"/g, "&quot;")}">
      </div>
      <div class="card-body">
        <h3>Next Event</h3>
        <p class="muted">${typeBadge} ${datePretty}${timeLabel}</p>
        <h4 class="card-title" style="margin-top:.25rem;">${evt.title || ""}</h4>
        ${evt.short ? `<p class="muted" style="margin-top:.25rem;">${evt.short}</p>` : ""}
        <a class="btn btn-link" href="/events.html">See details</a>
      </div>
    `;
  }

  async function loadAndRender() {
    const mount = $("#home-upcoming");
    if (!mount) return;

    try {
      const res = await fetch(SHEET_CSV_URL, { cache: "no-store" });
      const csv = await res.text();
      Papa.parse(csv, {
        header: true,
        skipEmptyLines: true,
        complete: ({ data }) => {
          const items = data
            .map(normalizeRow)
            .filter((r) => r.event_title || r.title)
            .map((r) => ({
              title: (r.event_title || r.title || "").trim(),
              type: (r.type || "").trim(),
              date: (r.date || "").trim(),
              time: (r.time || "").trim(),
              short: (r.short_description || r.short || "").trim(),
              long: (r.long_description || r.long || "").trim(),
              image: (r.image || "").trim(),
            }));

          if (!items.length) {
            const txt = mount.querySelector(".muted");
            if (txt) txt.textContent = "No upcoming events.";
            return;
          }

          const next = pickNextEvent(items);
          if (next) renderHomeUpcoming(next);
          else {
            const txt = mount.querySelector(".muted");
            if (txt) txt.textContent = "No upcoming events.";
          }
        },
        error: () => {
          const txt = mount.querySelector(".muted");
          if (txt) txt.textContent = "Could not load events.";
        },
      });
    } catch (e) {
      console.error(e);
      const txt = mount.querySelector(".muted");
      if (txt) txt.textContent = "Could not load events.";
    }
  }

  // Small style shim for the type chip, in case not present
  const style = document.createElement("style");
  style.textContent = `#home-upcoming .chip{display:inline-block;padding:.15rem .5rem;border-radius:999px;border:1px solid var(--border,#e5e7eb);font-size:.8rem;margin-right:.35rem;}`;
  document.head.appendChild(style);

  loadAndRender();
})();