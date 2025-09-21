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