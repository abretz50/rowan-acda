function guard(){ if(!window.netlifyIdentity) return; const back=()=>location.replace('account.html');
  netlifyIdentity.on('init',u=>{ if(!u) return back(); const r=u.app_metadata?.roles||[]; if(!(r.includes('admin')||r.includes('eboard'))) back(); });
  netlifyIdentity.on('logout', back); netlifyIdentity.init(); }
guard();
document.getElementById('logoutBtn')?.addEventListener('click',()=>netlifyIdentity.logout());

async function authHeaders(){ const u=netlifyIdentity.currentUser(); if(!u) return {}; return {Authorization:`Bearer ${await u.jwt()}`}; }

async function loadBoard(){
  const r = await fetch('/.netlify/functions/points-admin?kind=leaderboard'); const rows=await r.json();
  document.getElementById('leaderboard').innerHTML = rows.map(x=>`
    <div class="card">
      <h3>${x.full_name||x.email}</h3>
      <p class="muted">${x.email}</p>
      <p><strong>${x.points||0}</strong> points</p>
      <small>User ID: ${x.id}</small>
    </div>`).join('');
}

document.getElementById('adjustForm')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const body = { user_id: v('adjUser'), amount: parseInt(v('adjAmount'),10), reason: v('adjReason'), event_id: nv('adjEvent') };
  const r = await fetch('/.netlify/functions/points-admin', {method:'POST', headers:{'content-type':'application/json', ...(await authHeaders())}, body: JSON.stringify(body)});
  if(!r.ok){ alert('Failed'); return; } e.target.reset(); loadBoard();
});

document.getElementById('logForm')?.addEventListener('submit', async (e)=>{
  e.preventDefault(); const uid=v('logUser'); if(!uid) return;
  const r = await fetch('/.netlify/functions/points-admin?kind=user_log&user_id='+encodeURIComponent(uid));
  const rows = await r.json();
  document.getElementById('userLog').innerHTML = rows.map(x=>`
    <div class="card">
      <p>${x.amount>0?'+':''}${x.amount} — ${x.reason}</p>
      ${x.title? `<p class="muted">Event: ${x.title}</p>`:''}
      <small>${new Date(x.created_at).toLocaleString()}</small>
    </div>`).join('');
});

function v(id){return document.getElementById(id).value.trim();}
function nv(id){const t=v(id); return t||null;}

loadBoard();
