// /js/pdf-vault.js
(() => {
  // ====== SETTINGS ======
  const PASS = "acda2025"; // <— your password

  // All your vault content lives here.
  // Keep: const PASS = "acda2025";

const GROUPS = {
  /* ——— Your requested groups ——— */

  
 "SS#1: Musical Theater Day": [
  { label: "Sunday in the Park with George — Sunday", url: "/assets/pdfs/musical-theater/Sunday%20in%20the%20Park%20with%20George%20-%20Sunday.pdf" },
  { label: "Hamilton — Alexander Hamilton",            url: "/assets/pdfs/musical-theater/Hamilton%20-%20Alexander%20Hamilton.pdf" },
  { label: "Dear Evan Hansen — You Will Be Found",     url: "/assets/pdfs/musical-theater/Dear%20Evan%20Hansen%20-%20You%20Will%20Be%20Found.pdf" },
  { label: "Les Miserables — Medley",                  url: "/assets/pdfs/musical-theater/Les%20Miserables%20-%20Medley.pdf" },
  { label: "Hadestown — Wait for Me",                  url: "/assets/pdfs/musical-theater/Hadestown%20-%20Wait%20for%20Me.pdf" },
  { label: "Into the Woods — No One Is Alone",         url: "/assets/pdfs/musical-theater/Into%20The%20Woods%20-%20No%20One%20Is%20Alone.pdf" },
  { label: "West Side — Somewhere",                    url: "/assets/pdfs/musical-theater/West%20Side%20-%20Somewhere.pdf" }
],

"SS#2: Cabaret Rehearsal": [
  { label: "Into the Woods — No One Is Alone",         url: "/assets/pdfs/musical-theater/Into%20The%20Woods%20-%20No%20One%20Is%20Alone.pdf" } ]
 
"SS#3: Church Gig 101": []

"SS#4: Professional Development": []

"SS#5: Latin American Music": []

"SS#6: Conducting 101": []

"SS#7: Student Compositions": []

"SS#8: Barbershop": []

"SS#9: Holiday": []
  


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
