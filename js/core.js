// Core: nav toggle, dropdowns, theme, simple modal controls
(function(){
  const navToggle = document.querySelector('.nav-toggle');
  const nav = document.getElementById('site-nav');
  const menu = document.querySelector('.menu');
  const trigger = document.querySelector('.menu-trigger');

  // Mobile nav
  if (navToggle) {
    navToggle.addEventListener('click', () => {
      const open = nav.style.display === 'flex';
      nav.style.display = open ? 'none' : 'flex';
      navToggle.setAttribute('aria-expanded', String(!open));
    });
  }

  // Dropdown
  if (menu && trigger) {
    trigger.addEventListener('click', (e) => {
      const open = menu.classList.contains('open');
      menu.classList.toggle('open', !open);
      trigger.setAttribute('aria-expanded', String(!open));
    });
    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target)) {
        menu.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Theme toggle (simple class)
  const themeBtn = document.querySelector('.theme-toggle');
  themeBtn?.addEventListener('click', () => document.documentElement.classList.toggle('theme-deep'));

  // Spotlight modals from homepage (data-modal-open)
  document.querySelectorAll('[data-modal-open]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-modal-open');
      const modal = document.getElementById('modal-' + id);
      if (!modal) return;
      modal.setAttribute('aria-hidden', 'false');
      const closeTargets = modal.querySelectorAll('[data-modal-close]');
      closeTargets.forEach(ct => ct.addEventListener('click', () => modal.setAttribute('aria-hidden', 'true'), { once: true }));
      document.addEventListener('keydown', function esc(ev){
        if (ev.key === 'Escape') { modal.setAttribute('aria-hidden', 'true'); document.removeEventListener('keydown', esc); }
      });
    });
  });
})();
