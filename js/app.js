(async function initLayout(){
  const navbarHost = document.getElementById('navbar');
  if(navbarHost){
    try{
      const res = await fetch('partials/nav.html', {cache:'no-store'});
      navbarHost.innerHTML = await res.text();
      wireNav();
      markActive();
      initIdentity();
    }catch(e){ console.error('Navbar load failed', e); }
  }
})();
function wireNav(){
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  toggle?.addEventListener('click', ()=>{
    const open = links.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  links?.querySelectorAll('a').forEach(a=>a.addEventListener('click', ()=>links.classList.remove('open')));
}
function markActive(){
  const map = {'index.html':'home','events.html':'events','chapter.html':'chapter','eboard.html':'eboard','resources.html':'resources','gallery.html':'gallery'};
  const path = (location.pathname.split('/').pop() || 'index.html');
  const key = map[path] || 'home';
  document.querySelectorAll(`.nav-links a[data-page="${key}"]`).forEach(a=>{ a.classList.add('active'); a.setAttribute('aria-current','page'); });
}
// Netlify Identity UI glue
function initIdentity(){
  if(!window.netlifyIdentity){ return; }
  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const profile = document.getElementById('profile');
  const avatar = document.getElementById('avatar');
  const username = document.getElementById('username');
  const dashLink = document.getElementById('dashLink');

  function render(){
    const user = netlifyIdentity.currentUser();
    if(user){
      profile.style.display='inline-flex';
      logoutBtn.style.display='inline-flex';
      loginBtn.style.display='none';

      username.textContent = user.user_metadata?.full_name || user.email;
      avatar.src = user.user_metadata?.avatar_url || 'https://www.gravatar.com/avatar/?d=mp';
      avatar.alt = username.textContent;

      const roles = user.app_metadata?.roles || [];
      if (roles.includes('admin') || roles.includes('eboard')) {
        dashLink && (dashLink.style.display = '');
      } else {
        dashLink && (dashLink.style.display = 'none');
      }
    }else{
      profile.style.display='none';
      logoutBtn.style.display='none';
      loginBtn.style.display='inline-flex';
      dashLink && (dashLink.style.display = 'none');
    }
  }

  loginBtn?.addEventListener('click', ()=> netlifyIdentity.open());
  logoutBtn?.addEventListener('click', ()=> netlifyIdentity.logout());
  netlifyIdentity.on('init', render);
  netlifyIdentity.on('login', ()=>{ render(); netlifyIdentity.close(); });
  netlifyIdentity.on('logout', render);
  netlifyIdentity.init();
}



