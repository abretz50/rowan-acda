
(function(){
  const SITE_BASE = (window.SITE_BASE || "").replace(/\/$/, "");
  const resolve = (p) => SITE_BASE + p;

  async function inject(selector, paths){
    const host = document.querySelector(selector);
    if (!host) return;
    for (const p of paths){
      try{
        const r = await fetch(resolve(p), { cache: "no-cache" });
        if (r.ok){
          host.outerHTML = await r.text();
          return;
        }
      }catch(e){/* try next */}
    }
    console.error("Failed to load partial", selector);
  }

  function setLinksAndActive(){
    const here = (location.pathname.replace(/\/$/, "") || "/");
    document.querySelectorAll("a[data-href]").forEach(a => {
      const target = a.getAttribute("data-href");
      const href = resolve(target);
      a.setAttribute("href", href);

      const normTarget = (target.replace(/\/$/, "") || "/");
      if (here === normTarget || (normTarget !== "/" && here.startsWith(normTarget))) {
        a.classList.add("active");
        a.setAttribute("aria-current","page");
      }
    });
  }

  function wireMenu(){
    const btn = document.getElementById("navToggle");
    const links = document.getElementById("navLinks");
    if(!btn || !links) return;
    btn.addEventListener("click", () => {
      const showing = links.classList.toggle("show");
      btn.setAttribute("aria-expanded", showing ? "true" : "false");
    });
  }

  async function boot(){
    await inject("nav.site-nav", ["/partials/nav.html","partials/nav.html"]);
    setLinksAndActive();
    wireMenu();
    await inject("footer.site-footer", ["/partials/footer.html","partials/footer.html"]);
    setLinksAndActive();
  }
  document.addEventListener("DOMContentLoaded", boot);
})();
