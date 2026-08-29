/* ============================================================
   js/live-images.js — applies E-Board Portal Gallery folder
   images to whatever the public page marks up: an <img> tagged
   data-live-img="<key>" gets its src swapped, and any element
   tagged data-live-bg="<key>" gets its --banner-img CSS var set.
   No-op on pages with no matching elements, so this is safe to
   include everywhere. Keys match the `liveTarget` folders seeded
   in netlify/functions/portal-gallery.mjs.
   ============================================================ */
(function(){
  fetch('/.netlify/functions/portal-gallery', { cache: 'no-store' })
    .then(r => r.json())
    .then(data => {
      if (!data.ok || !data.liveImages) return;
      const map = data.liveImages;
      document.querySelectorAll('[data-live-img]').forEach(el => {
        const url = map[el.dataset.liveImg];
        if (url) el.src = url;
      });
      document.querySelectorAll('[data-live-bg]').forEach(el => {
        const url = map[el.dataset.liveBg];
        if (url) el.style.setProperty('--banner-img', `url('${url}')`);
      });
    })
    .catch(() => { /* keep whatever's already in the static markup */ });
})();
