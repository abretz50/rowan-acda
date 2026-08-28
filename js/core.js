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

// Account nav link: shows "Sign In" / "Sign Out" based on session state.
// Signed-out click behaves like a normal link to /account.html; signed-in
// click logs out immediately instead of navigating there. Pages that
// change auth state without a full navigation (account.html's own sign-in
// form, portal.html's login/bootstrap) should call
// window.refreshAccountNavLink() right after so this updates immediately
// instead of waiting for the next page load.
window.refreshAccountNavLink = async function refreshAccountNavLink() {
  const link = document.querySelector('.nav a[href="/account.html"]');
  if (!link) return;
  link.classList.add('nav-link--account');
  if (!link.dataset.wired) {
    link.dataset.wired = '1';
    link.addEventListener('click', async (e) => {
      if (link.dataset.signedIn !== '1') return; // let the default navigation happen
      e.preventDefault();
      await fetch('/.netlify/functions/portal-auth', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      });
      location.href = '/';
    });
  }
  try {
    const res = await fetch('/.netlify/functions/portal-auth', { credentials: 'include' });
    const data = await res.json();
    link.dataset.signedIn = data.ok ? '1' : '0';
    link.textContent = data.ok ? 'Sign Out' : 'Sign In';
  } catch { /* leave whatever label was already there */ }
};
document.addEventListener('DOMContentLoaded', window.refreshAccountNavLink);
