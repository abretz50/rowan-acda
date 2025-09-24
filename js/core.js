// Mobile nav & active link
const navToggle = document.getElementById('nav-toggle');
const siteNav = document.getElementById('site-nav');
if (navToggle && siteNav){
  navToggle.addEventListener('click', ()=>{
    siteNav.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', siteNav.classList.contains('open') ? 'true' : 'false');
  });
}
// Mark active link based on pathname
(function markActive(){
  const path = location.pathname.replace(/\/index\.html?$/,'/');
  document.querySelectorAll('.nav a[data-nav]').forEach(a=>{
    const target = a.getAttribute('href');
    if ((target === '/' && path === '/') || (target !== '/' && path.endsWith(target))) {
      a.classList.add('is-active');
    }
  });
})();

// Simple modal manager (data-modal="id")
document.addEventListener('click', (e)=>{
  const btn = e.target.closest('[data-modal]');
  if (btn){
    const id = btn.getAttribute('data-modal');
    const modal = document.getElementById(id);
    if (modal){ modal.classList.add('open'); modal.querySelector('.dialog').focus(); }
  }
  if (e.target.classList.contains('modal')){
    e.target.classList.remove('open');
  }
});
document.addEventListener('keydown', (e)=>{
  if (e.key === 'Escape'){
    document.querySelectorAll('.modal.open').forEach(m=>m.classList.remove('open'));
  }
});

// Highlight active nav item
document.addEventListener('DOMContentLoaded', () => {
  const norm = p => p
    .replace(/\/index\.html?$/,'/')
    .replace(/\/+$/,'/') || '/';

  const here = norm(location.pathname);
  let best = null;

  document.querySelectorAll('#site-nav a[data-nav]').forEach(a => {
    const href = norm(new URL(a.getAttribute('href'), location.origin).pathname);
    // exact or prefix match (prefer the longest match)
    const isMatch = (here === href) || (href !== '/' && here.startsWith(href));
    if (isMatch && (!best || href.length > best.len)) {
      best = { el: a, len: href.length };
    }
  });

  if (best) best.el.setAttribute('aria-current', 'page');
});
