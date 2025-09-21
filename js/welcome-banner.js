(function(){
  const key='welcomeBandDismissed:v2';
  window.addEventListener('DOMContentLoaded', function(){
    const band = document.getElementById('welcome-band');
    if(!band) return;
    try{ if(localStorage.getItem(key)==='1'){ band.classList.add('hidden'); return; } }catch(e){}
    const btn = band.querySelector('.close');
    if(btn){
      btn.addEventListener('click', function(){
        band.classList.add('hidden');
        try{ localStorage.setItem(key,'1'); }catch(e){}
      });
    }
  });
})();