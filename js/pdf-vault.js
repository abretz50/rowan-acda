// /js/pdf-vault.js
(() => {
  // ====== SETTINGS ======
  const PASS = "acda2025"; // <— your password

  // All your vault content lives here.
  // Keep: const PASS = "acda2025";

const GROUPS = {
  /* ——— Your requested groups ——— */

  "Musical Theater": [
    { label: "MT — Treble Cuts", url: "/assets/pdfs/musical-theater/treble-cuts.pdf" },
    { label: "MT — TB Cuts",     url: "/assets/pdfs/musical-theater/tb-cuts.pdf" },
    { label: "MT — Audition Book", url: "/assets/pdfs/musical-theater/audition-book.pdf" }
  ],
  "Choral Repertoire": [
    { label: "Mixed (SATB) Packet 1", url: "/assets/pdfs/choral-repertoire/satb-packet-1.pdf" },
    { label: "Treble (SSA) Packet 1", url: "/assets/pdfs/choral-repertoire/ssa-packet-1.pdf" },
    { label: "TB (TTBB) Packet 1",    url: "/assets/pdfs/choral-repertoire/ttbb-packet-1.pdf" }
  ],
  "Church Music": [
    { label: "Hymn Tunes Set A", url: "/assets/pdfs/church-music/hymn-tunes-a.pdf" },
    { label: "Anthems Packet",   url: "/assets/pdfs/church-music/anthems-packet.pdf" }
  ],
  "Barbershop": [
    { label: "Barbershop — Polecats", url: "/assets/pdfs/barbershop/polecats.pdf" },
    { label: "Barbershop — Tags",     url: "/assets/pdfs/barbershop/tags.pdf" }
  ],
  "Contemporary": [
    { label: "A Cappella Charts (SATB)", url: "/assets/pdfs/contemporary/acappella-satb.pdf" },
    { label: "Vocal Percussion Basics",  url: "/assets/pdfs/contemporary/vp-basics.pdf" }
  ],
  "World Music": [
    { label: "Global Repertoire Sampler", url: "/assets/pdfs/world-music/sampler.pdf" },
    { label: "Pronunciation Guides",      url: "/assets/pdfs/world-music/pronunciation.pdf" }
  ],
   "Holiday": [
    { label: "Winter Carols (SSA)",  url: "/assets/pdfs/holiday/winter-ssa.pdf" },
    { label: "Winter Carols (TTBB)", url: "/assets/pdfs/holiday/winter-ttbb.pdf" }
  ]
};


  // ====== DOM ======
  const sel = document.getElementById("group");
  const pw  = document.getElementById("pw");
  const btn = document.getElementById("vault-open");
  const status = document.getElementById("vault-status");
  const tabs = document.getElementById("vault-tabs");
  const viewer = document.getElementById("vault-viewer");

  // Populate the Category <select> from GROUPS
  function populateCategories() {
    sel.innerHTML = "";
    Object.keys(GROUPS).forEach(name => {
      const opt = document.createElement("option");
      opt.textContent = name;
      sel.appendChild(opt);
    });
  }

  // Build tab buttons for a category’s files
  function renderTabs(files) {
    tabs.innerHTML = "";
    if (!files?.length) {
      tabs.innerHTML = `<p class="small">No files in this group yet.</p>`;
      viewer.classList.add("hidden");
      viewer.removeAttribute("src");
      return;
    }
    const tabRow = document.createElement("div");
    tabRow.className = "file-tabs-row";
    files.forEach((f, i) => {
      const b = document.createElement("button");
      b.className = "btn btn-outline";
      b.type = "button";
      b.textContent = f.label || `File ${i+1}`;
      b.addEventListener("click", () => openFile(f.url, b, tabRow));
      tabRow.appendChild(b);
    });
    tabs.appendChild(tabRow);
    // auto-open first
    tabRow.querySelector("button")?.click();
  }

  function openFile(url, btnEl, row) {
    // mark selected
    row.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed","false"));
    btnEl.setAttribute("aria-pressed","true");
    // show pdf
    viewer.src = url;
    viewer.classList.remove("hidden");
  }

  function unlock() {
    const chosen = sel.value;
    if (pw.value.trim() !== PASS) {
      status.textContent = "Incorrect password.";
      status.style.color = "var(--accent, #7A0A0A)";
      tabs.innerHTML = "";
      viewer.classList.add("hidden");
      viewer.removeAttribute("src");
      return;
    }
    status.textContent = "Unlocked.";
    status.style.color = "var(--muted)";
    renderTabs(GROUPS[chosen]);
  }

  // Events
  btn?.addEventListener("click", unlock);
  pw?.addEventListener("keydown", (e) => { if (e.key === "Enter") unlock(); });

  // Boot
  populateCategories();
})();
