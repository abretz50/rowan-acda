(async function(){
  const groupSelect = document.getElementById('group');
  const passInput = document.getElementById('password');
  const enterBtn = document.getElementById('enter');
  const msg = document.getElementById('gate-msg');
  const viewer = document.getElementById('viewer');
  const filelist = document.getElementById('filelist');
  const embed = document.getElementById('pdf-embed');

  let groups = [];
  try {
    const res = await fetch('/data/resources.json');
    const data = await res.json();
    groups = data.groups || [];
  } catch (e) {
    msg.textContent = 'Could not load resource groups.';
  }

  // Populate selector
  for (const g of groups) {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = g.name;
    groupSelect.appendChild(opt);
  }

  async function checkGate(){
    const selected = groups.find(g => g.id === groupSelect.value);
    if (!selected){ msg.textContent = 'Choose a group.'; return false; }
    const entered = passInput.value || '';
    const hash = await window.sha256ToBase64(entered);
    const stored = (selected.passwordHash || '').split(':').pop(); // accept "sha256:<b64>" or b64
    if (hash === stored){
      msg.textContent = 'Unlocked.';
      return selected;
    } else {
      msg.textContent = 'Incorrect password.';
      return false;
    }
  }

  function renderFiles(group){
    filelist.innerHTML = '';
    viewer.classList.remove('hidden');
    if (!group.files || !group.files.length){
      embed.removeAttribute('src');
      filelist.innerHTML = '<div class="muted" style="padding:12px">No files yet.</div>';
      return;
    }
    group.files.forEach((f, idx) => {
      const btn = document.createElement('button');
      btn.setAttribute('role','tab');
      btn.textContent = f.title;
      btn.addEventListener('click', () => {
        filelist.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected','false'));
        btn.setAttribute('aria-selected','true');
        embed.setAttribute('src', f.path);
      });
      if (idx === 0){ btn.setAttribute('aria-selected','true'); embed.setAttribute('src', f.path); }
      filelist.appendChild(btn);
    });
  }

  enterBtn?.addEventListener('click', async () => {
    const group = await checkGate();
    if (group) renderFiles(group);
  });

  // Allow Enter key in password input
  passInput?.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter'){
      const group = await checkGate();
      if (group) renderFiles(group);
    }
  });
})();
