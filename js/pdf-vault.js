// /js/pdf-vault.js
(() => {
  // ====== SETTINGS ======
  const PASS = "acda2025"; // <— your password

  // Small helper to safely build file URLs (handles spaces, apostrophes, etc.)
  const fileUrl = (dir, name) => `/assets/pdfs/${dir}/${encodeURIComponent(name)}`;

  // Convenience helper to define an entry
  const f = (label, dir, name) => ({ label, url: fileUrl(dir, name) });

  // ====== CONTENT ======
  const GROUPS = {
    "SS#1: Musical Theater Day": [
      f("Sunday in the Park with George — Sunday", "musical-theater", "Sunday in the Park with George - Sunday.pdf"),
      f("Hamilton — Alexander Hamilton",            "musical-theater", "Hamilton - Alexander Hamilton.pdf"),
      f("Dear Evan Hansen — You Will Be Found",     "musical-theater", "Dear Evan Hansen - You Will Be Found.pdf"),
      f("Les Miserables — Medley",                  "musical-theater", "Les Miserables - Medley.pdf"),
      f("Hadestown — Wait for Me",                  "musical-theater", "Hadestown - Wait for Me.pdf"),
      f("Into the Woods — No One Is Alone",         "musical-theater", "Into The Woods - No One Is Alone.pdf"),
      f("West Side — Somewhere",                    "musical-theater", "West Side - Somewhere.pdf"),
    ],

    "SS#2: Cabaret Rehearsal": [
      f("Into the Woods — No One Is Alone", "musical-theater", "Into The Woods - No One Is Alone.pdf"),
      f("Martin — The Awakening",           "choral-rep",      "The Awakening - Martin.pdf"),
      f("Ticheli — Earth Song",             "choral-rep",      "Earth Song.pdf"),
    ],

    "SS#3: Church Gig 101": [
      f("Into the Woods — No One Is Alone", "musical-theater", "Into The Woods - No One Is Alone.pdf"),
      f("Abide With Me",                     "church-music",    "Abide With Me.pdf"),
      f("Lift Every Voice and Sing",         "church-music",    "Lift Every Voice and Sing .pdf"),
      f("How Great Thou Art",                "church-music",    "How Great Thou Art.pdf"),
    ],

    // ✅ NEW: ACIT Visit group populated from /assets/pdfs/acit
    "SS#4: ACIT Visit": [
      // These file names match what’s in your screenshot (including spaces before ".pdf")
      f("Damask Roses",                     "acit", "Damask Roses .pdf"),
      f("Let Me Be Your Star",              "acit", "Let Me Be Your Star .pdf"),
      f("Loneliness of Evening",            "acit", "Loneliness of Evening.pdf"),
      f("The Year's at the Spring",         "acit", "The year's at the spring.pdf"), // ← make sure the file actually includes ".pdf"
      f("Weep You No More, Sad Fountains",  "acit", "Weep You No More Sad Fountains .pdf"),
    ],

    "SS#5: Latin American Music": [],
    "SS#6: Conducting 101": [],
    "SS#7: Student Compositions": [],
    "SS#8: Barbershop": [],
    "SS#9: Holiday": [],
  };

  // ====== DOM ======
  const sel    = document.getElementById("group");
  const pw     = document.getElementById("pw");
  const btn    = document.getElementById("vault-open");
  const status = document.getElementById("vault-status");
  const tabs   = document.getElementById("vault-tabs");
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
      b.textContent = f.label || `File ${i + 1}`;
      b.addEventListener("click", () => openFile(f.url, b, tabRow));
      tabRow.appendChild(b);
    });
    tabs.appendChild(tabRow);
    // auto-open first
    tabRow.querySelector("button")?.click();
  }

  function openFile(url, btnEl, row) {
    row.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", "false"));
    btnEl.setAttribute("aria-pressed", "true");
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

  // ====== Events ======
  btn?.addEventListener("click", unlock);
  pw?.addEventListener("keydown", (e) => { if (e.key === "Enter") unlock(); });
  sel?.addEventListener("change", () => {
    if (pw.value.trim() === PASS) {
      status.textContent = "Unlocked.";
      status.style.color = "var(--muted)";
      renderTabs(GROUPS[sel.value]);
    }
  });

  // Boot
  populateCategories();
  pw?.focus?.();
})();
