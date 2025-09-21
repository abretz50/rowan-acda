async function sha256hex(str){
  const enc = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function fetchGroups(){
  const res = await fetch('/data/resources.json');
  const data = await res.json();
  return data.groups || [];
}
async function tryUnlock(){
  const groupName = document.getElementById('group').value;
  const pw = document.getElementById('pw').value;
  const groups = await fetchGroups();
  const g = groups.find(x => x.name === groupName);
  const status = document.getElementById('vault-status');
  const tabs = document.getElementById('vault-tabs');
  const viewer = document.getElementById('vault-viewer');
  tabs.innerHTML=''; viewer.classList.add('hidden'); viewer.removeAttribute('src');
  if (!g){ status.textContent='Group not found.'; return; }
  const hashed = await sha256hex(pw);
  if (hashed !== g.password_sha256){ status.textContent='Incorrect password.'; return; }
  status.textContent = 'Unlocked.';
  for (const file of g.files){
    const a = document.createElement('a');
    a.href = file.path; a.textContent = file.label; a.target = '_blank';
    a.addEventListener('click', (e)=>{ e.preventDefault(); viewer.classList.remove('hidden'); viewer.setAttribute('src', file.path); });
    tabs.appendChild(a);
  }
}
window.addEventListener('DOMContentLoaded', ()=>{
  document.getElementById('vault-open').addEventListener('click', tryUnlock);
});