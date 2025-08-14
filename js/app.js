(async function initLayout(){
  const navbarHost = document.getElementById('navbar');
  if(navbarHost){
    try{
      const res = await fetch('partials/nav.html', {cache:'no-store'});
      navbarHost.innerHTML = await res.text();
      wireNav();
      hydrateLogin();
      markActive();
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
  const map = {
    'index.html':'home',
    'events.html':'events',
    'chapter.html':'chapter',
    'eboard.html':'eboard',
    'resources.html':'resources'
  };
  const path = (location.pathname.split('/').pop() || 'index.html');
  const key = map[path] || 'home';
  document.querySelectorAll(`.nav-links a[data-page="${key}"]`).forEach(a=>{
    a.classList.add('active');
    a.setAttribute('aria-current','page');
  });
}

// Modal helpers
function lockScroll(lock){
  document.documentElement.style.overflow = lock ? 'hidden' : '';
  document.body.style.overflow = lock ? 'hidden' : '';
}

// Demo "auth" with localStorage
function hydrateLogin(){
  const loginBtn = document.getElementById('loginBtn');
  const modal = document.getElementById('loginModal');
  const closeBtn = document.querySelector('.modal-close');
  const form = document.getElementById('loginForm');

  const user = JSON.parse(localStorage.getItem('demo_user') || 'null');
  updateLoginUI(user);

  loginBtn?.addEventListener('click', ()=>{
    const current = JSON.parse(localStorage.getItem('demo_user') || 'null');
    if(current){
      localStorage.removeItem('demo_user');
      updateLoginUI(null);
    }else{
      modal?.setAttribute('aria-hidden','false'); 
      lockScroll(true);
      setTimeout(()=> document.getElementById('email')?.focus(), 0);
    }
  });
  closeBtn?.addEventListener('click', ()=>{ modal?.setAttribute('aria-hidden','true'); lockScroll(false);} );
  modal?.addEventListener('click', (e)=>{ if(e.target === modal){ modal.setAttribute('aria-hidden','true'); lockScroll(false);} });

  form?.addEventListener('submit', (e)=>{
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const user = { email, name: email.split('@')[0] };
    localStorage.setItem('demo_user', JSON.stringify(user));
    updateLoginUI(user);
    modal?.setAttribute('aria-hidden','true'); 
    lockScroll(false);
  });
}

function updateLoginUI(user){
  const btn = document.getElementById('loginBtn');
  if(!btn) return;
  if(user){
    btn.textContent = 'Log out';
    btn.classList.remove('btn-primary');
    btn.classList.add('btn-ghost');
    const brandText = document.querySelector('.brand-text');
    if(brandText && !brandText.dataset.hasGreeting){
      brandText.dataset.hasGreeting = '1';
      brandText.insertAdjacentHTML('afterend', `<span class="muted small" style="margin-left:8px">Hi, ${user.name}</span>`);
    }
  }else{
    btn.textContent = 'Log in';
    btn.classList.add('btn-primary');
    btn.classList.remove('btn-ghost');
  }
}
