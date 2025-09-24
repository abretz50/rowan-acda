// /js/pdf-vault.js
(() => {
  // ====== SETTINGS ======
  const PASS = "acda2025"; // <— your password

  // All your vault content lives here.
  // Replace the sample URLs with your real PDF paths.
  const GROUPS = {
    "Musical Theater Day": [
      { label: "Set 1 — Treble", url: "/assets/pdfs/mt_day/set1_treble.pdf" },
      { label: "Set 1 — TB",     url: "/assets/pdfs/mt_day/set1_tb.pdf" },
      { label: "Audition Cuts",  url: "/assets/pdfs/mt_day/audition_cuts.pdf" }
    ],
    "Warm-ups": [
      { label: "5-Note Patterns", url: "/assets/pdfs/warmups/5-note-patterns.pdf" },
      { label: "Descending Scales", url: "/assets/pdfs/warmups/descending-scales.pdf" }
    ],
    "Level 1 Patterns": [
      { label: "Do-Mi-So Sets", url: "/assets/pdfs/level1/do-mi-so.pdf" },
      { label: "Stepwise in C", url: "/assets/pdfs/level1/stepwise-c.pdf" }
    ],
    "Holiday Pack": [
      { label: "Carol Packet (Treble)", url: "/assets/pdfs/holiday/treble-carols.pdf" },
      { label: "Carol Packet (TB)",     url: "/assets/pdfs/holiday/tb-carols.pdf" }
    ],
    "Rhythm Drills": [
      { label: "Simple Meter 1", url: "/assets/pdfs/rhythm/simple-meter-1.pdf" },
      { label: "Compound Meter", url: "/assets/pdfs/rhythm/compound-meter.pdf" }
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
