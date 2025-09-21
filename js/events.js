/* /js/events.js
   - Fetch events from Google Sheet CSV (PapaParse)
   - Render cards in #events-grid
   - Open modal with full details (overlay, Esc/overlay click to close)
   - Integrates with #event-search and #tag-chips for live filtering
   - Keyboard accessible (Enter/Space to open; Esc to close)
*/

(() => {
  // ====== CONFIG ======
  const SHEET_CSV_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vSESaEnsqhseKRcrAkMj0Gu-gEAzHjYYdfTlpkAxaUVyUl6MERihQkWTMVlzk7nbWA3xE9g1orMChUo/pub?gid=0&single=true&output=csv";
  const IMG_FALLBACK = "/assets/images/event-placeholder.png"; // adjust path to your asset

  // ====== STATE ======
  let ALL_EVENTS = [];
  let ACTIVE_TAG = "All";
  let SEARCH_TERM = "";

  // ====== HELPERS ======
  function normalizeRow(row) {
    const out = {};
    for (const k in row) {
      const key = String(k || "").trim().toLowerCase().replace(/\s+/g, "_");
      out[key] = row[k];
    }
    return out;
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

  // Create a Date for sorting using first time in the range if present
  function startDateFrom(item) {
    const dateStr = (item.date || "").trim();
    const startTime = (item.time || "").split("-")[0]?.trim() || "";
    const dt = new Date(`${dateStr} ${startTime}`);
    return isNaN(dt) ? new Date(dateStr) : dt;
  }

  function escapeAttr(str = "") {
    return String(str).replace(/"/g, "&quot;");
  }

  // ====== MODAL CONTROL ======
  function closeAllModals() {
    document.querySelectorAll(".card-modal").forEach((c) => c.remove());
    const ov = document.getElementById("modal-overlay");
    if (ov) ov.style.display = "none";
    document.body.classList.remove("modal-open");
  }

  function showModal(html) {
    closeAllModals();
    const mount = document.getElementById("event-modals") || document.body;
    const wrap = document.createElement("div");
    wrap.className = "card-modal";
    wrap.innerHTML = html;
    mount.appendChild(wrap);

    const ov = document.getElementById("modal-overlay");
    if (ov) ov.style.display = "block";
    document.body.classList.add("modal-open");

    const closeBtn = wrap.querySelector("[data-close]");
    if (closeBtn) closeBtn.focus();
  }

  function hideModal() {
    closeAllModals();
  }

  document.addEventListener("click", (e) => {
    if (e.target && e.target.id === "modal-overlay") hideModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideModal();
  });

  // ====== RENDER ======
  function renderEventsGrid(events) {
    const grid = document.getElementById("events-grid");
    const modalsRoot = document.getElementById("event-modals");
    if (!grid) return;

    grid.innerHTML = "";
    if (modalsRoot) modalsRoot.innerHTML = "";

    if (!events.length) {
      grid.innerHTML = `<p class="muted">No matching events.</p>`;
      return;
    }

    const frag = document.createDocumentFragment();

    events.forEach((e, idx) => {
      const id = `evt-${idx + 1}`;
      const imgSrc = e.image || IMG_FALLBACK;
      const prettyDate = formatDatePretty(e.date);
      const timeLabel = e.time ? ` • ${e.time}` : "";
      const typeBadge = e.type
        ? `<span class="chip" aria-label="Event type">${e.type}</span>`
        : "";

      const card = document.createElement("article");
      card.className = "card";
      card.setAttribute("tabindex", "0");
      card.setAttribute("role", "button");
      card.setAttribute("aria-haspopup", "dialog");
      card.setAttribute("aria-controls", id);

      card.innerHTML = `
        <div class="aspect" aria-hidden="true">
          <img loading="lazy" src="${imgSrc}" alt="${escapeAttr(e.title)}">
        </div>
        <div class="card-body">
          <div class="card-meta">
            ${typeBadge}
            <span class="muted">${prettyDate}${timeLabel}</span>
          </div>
          <h3 class="card-title">${e.title}</h3>
          ${e.short ? `<p class="muted">${e.short}</p>` : ""}
        </div>
      `;

      const open = () => openEventModal(id, e);
      card.addEventListener("click", open);
      card.addEventListener("keypress", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          open();
        }
      });

      frag.appendChild(card);
    });

    grid.appendChild(frag);
  }

  function openEventModal(id, e) {
    const prettyDate = formatDatePretty(e.date);
    const timeLabel = e.time ? ` | Time: ${e.time}` : "";
    const typeLabel = e.type ? `Type: ${e.type} | ` : "";

    const html = `
      <div id="${id}" class="card-content" role="dialog" aria-modal="true" aria-labelledby="${id}-title">
        <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
          <h2 id="${id}-title" class="h3" style="margin:0;">${e.title}</h2>
          <button class="btn" data-close onclick="void 0" aria-label="Close" style="white-space:nowrap;" type="button">Close</button>
        </div>
        <p class="muted" style="margin-top:8px;">${typeLabel}Date: ${prettyDate}${timeLabel}</p>
        ${e.long ? `<p style="margin-top:12px;">${e.long}</p>` : (e.short ? `<p style="margin-top:12px;">${e.short}</p>` : "")}
      </div>
    `;

    showModal(html);

    // wire close button inside this modal
    const latestModal = document.querySelector(".card-modal .card-content [data-close]");
    if (latestModal) latestModal.addEventListener("click", hideModal);
  }

  // ====== FILTERING ======
  function applyFilters() {
    const term = (SEARCH_TERM || "").toLowerCase();
    const tag = ACTIVE_TAG;

    const filtered = ALL_EVENTS.filter((e) => {
      const tagOk =
        tag === "All" || String(e.type || "").toLowerCase() === tag.toLowerCase();

      if (!term) return tagOk;

      const hay = [e.title || "", e.type || "", e.short || "", e.long || ""]
        .join(" ")
        .toLowerCase();

      return tagOk && hay.includes(term);
    });

    renderEventsGrid(filtered);
  }

  function hookSearchAndChips() {
    const search = document.getElementById("event-search");
    if (search) {
      search.addEventListener("input", (e) => {
        SEARCH_TERM = e.target.value || "";
        applyFilters();
      });
    }

    const chips = document.getElementById("tag-chips");
    if (chips) {
      chips.addEventListener("click", (e) => {
        const btn = e.target.closest("button.chip");
        if (!btn) return;
        ACTIVE_TAG = btn.dataset.tag || "All";

        chips.querySelectorAll("button.chip").forEach((b) => {
          b.setAttribute("aria-pressed", String(b === btn));
        });

        applyFilters();
      });
    }
  }

  // ====== DATA LOADING ======
  async function fetchEventsFromSheet() {
    const res = await fetch(SHEET_CSV_URL, { cache: "no-store" });
    const csv = await res.text();
    return new Promise((resolve, reject) => {
      Papa.parse(csv, {
        header: true,
        skipEmptyLines: true,
        complete: ({ data }) => {
          const items = data
            .map(normalizeRow)
            .filter((r) => r.event_title || r.title)
            .map((r) => ({
              title: (r.event_title || r.title || "").trim(),
              type: (r.type || "").trim(), // "General", "Professional", etc.
              date: (r.date || "").trim(), // e.g. "9/12/2025"
              time: (r.time || "").trim(), // e.g. "3:00pm - 4:00pm"
              short: (r.short_description || r.short || "").trim(),
              long: (r.long_description || r.long || "").trim(),
              image: (r.image || "").trim(),
            }))
            .sort((a, b) => startDateFrom(a) - startDateFrom(b));

          resolve(items);
        },
        error: reject,
      });
    });
  }

  // ====== BOOTSTRAP ======
  async function init() {
    // Minimal styles for modal/overlay and cards if your CSS doesn't already cover them
    const style = document.createElement("style");
    style.textContent = `
      #modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:999; }
      .card-modal .card-content {
        position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
        background:#fff; padding:24px; border:1px solid #ddd;
        box-shadow:0 10px 30px rgba(0,0,0,.2); z-index:1000;
        max-width:680px; width:92%; max-height:85vh; overflow:auto; border-radius:14px;
      }
      body.modal-open { overflow:hidden; }
      .cards-grid { gap:16px; display:grid; grid-template-columns:repeat(auto-fill, minmax(260px,1fr)); }
      .card .aspect { aspect-ratio:16/9; overflow:hidden; border-radius:12px; background:#f3f4f6; }
      .card .aspect img { width:100%; height:100%; object-fit:cover; display:block; }
      .card .card-meta { display:flex; align-items:center; gap:8px; justify-content:space-between; }
      .card .card-title { margin:.5rem 0 .25rem; }
    `;
    document.head.appendChild(style);

    hookSearchAndChips();

    try {
      ALL_EVENTS = await fetchEventsFromSheet();
      renderEventsGrid(ALL_EVENTS);
    } catch (err) {
      console.error(err);
      const grid = document.getElementById("events-grid");
      if (grid) grid.innerHTML = `<p>There was a problem loading events.</p>`;
    }
  }

  init();
})();
