// Load events.json, render cards, filter/search, and show modal details
(async function(){
  const grid = document.getElementById('events-grid');
  const modals = document.getElementById('event-modals');
  const search = document.getElementById('event-search');
  const chips = document.getElementById('tag-chips');

  let events = [];
  try {
    const res = await fetch('/data/events.json');
    events = await res.json();
  } catch (e) {
    console.error('Failed to load events.json', e);
  }

  let activeTag = 'All';
  let query = '';

  const render = () => {
    const q = query.trim().toLowerCase();
    const filtered = events.filter(ev => {
      const tagMatch = (activeTag === 'All') || (ev.tags?.includes(activeTag));
      const qMatch = !q || [ev.title, ev.excerpt, ev.description, ...(ev.tags||[])].join(' ').toLowerCase().includes(q);
      return tagMatch && qMatch;
    });

    grid.innerHTML = filtered.map(ev => `
      <article class="card" data-id="${ev.id}">
        <div class="card-media">${ev.image ? `<img src="${ev.image}" alt="">` : ''}</div>
        <div class="card-body">
          <div class="meta">${new Date(ev.date).toLocaleString()}</div>
          <h3>${ev.title}</h3>
          <p class="muted">${ev.excerpt || ''}</p>
          <div class="tags">${(ev.tags||[]).map(t => `<span class="chip" style="pointer-events:none">${t}</span>`).join('')}</div>
          <button class="btn btn-outline" data-open="${ev.id}">Details</button>
        </div>
      </article>
    `).join('');

    // Build modals
    modals.innerHTML = filtered.map(ev => `
      <div class="modal" id="modal-${ev.id}" aria-hidden="true" aria-labelledby="modal-title-${ev.id}" role="dialog">
        <div class="modal-backdrop" data-modal-close></div>
        <div class="modal-window" role="document">
          <button class="modal-close" aria-label="Close" data-modal-close>&times;</button>
          <h3 id="modal-title-${ev.id}">${ev.title}</h3>
          <p class="muted">${new Date(ev.date).toLocaleString()} · ${ev.location || ''}</p>
          <div>${ev.description || ''}</div>
          <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap">
            ${(ev.links||[]).map(l => `<a class="btn btn-primary" href="${l.href}">${l.label}</a>`).join('')}
          </div>
        </div>
      </div>
    `).join('');

    // Wire up open buttons
    grid.querySelectorAll('[data-open]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-open');
        const modal = document.getElementById('modal-' + id);
        if (!modal) return;
        modal.setAttribute('aria-hidden', 'false');
        modal.querySelectorAll('[data-modal-close]').forEach(ct => ct.addEventListener('click', () => {
          modal.setAttribute('aria-hidden','true');
        }, { once:true }));
        document.addEventListener('keydown', function esc(ev){
          if (ev.key === 'Escape') { modal.setAttribute('aria-hidden', 'true'); document.removeEventListener('keydown', esc); }
        });
      });
    });
  };

  // Initial render
  render();

  // Chips
  chips?.addEventListener('click', (e) => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    activeTag = btn.dataset.tag;
    chips.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c === btn)));
    render();
  });

  // Search
  search?.addEventListener('input', (e) => {
    query = e.target.value || '';
    render();
  });
})();
