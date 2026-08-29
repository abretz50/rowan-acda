/* ============================================================
   js/site-text.js — applies E-Board Portal Site Content text to
   whatever the public page marks up: any element tagged
   data-live-text="<key>" gets its textContent replaced. Also
   exposes the full content payload (resources, merch, etc.) via
   window.siteContentReady, a promise pages can await for their
   own custom rendering (merch list, resource lists). No-op on
   pages with no matching elements. Keys match content.siteText
   in netlify/functions/_lib/contentSeed.mjs.
   ============================================================ */
window.siteContentReady = fetch('/.netlify/functions/portal-content', { cache: 'no-store' })
  .then(r => r.json())
  .then(data => {
    if (!data.ok) return null;
    const text = data.siteText || {};
    document.querySelectorAll('[data-live-text]').forEach(el => {
      const value = text[el.dataset.liveText];
      if (value) el.textContent = value;
    });
    return data;
  })
  .catch(() => null);
