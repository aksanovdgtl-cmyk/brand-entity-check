(function(){
  const root=document.currentScript.closest('.hzt');
  const form=root.querySelector('#hzt-brand-form');
  const brandInput=root.querySelector('#hzt-brand-name');
  const domainInput=root.querySelector('#hzt-brand-domain');
  const bar=root.querySelector('.hzt__bar');
  const percent=root.querySelector('.hzt__percent');
  const steps=[...root.querySelectorAll('.hzt__step')];
  const scoreEl=root.querySelector('#hzt-brand-score');
  const titleEl=root.querySelector('#hzt-brand-title');
  const copyEl=root.querySelector('#hzt-brand-copy');
  const checksEl=root.querySelector('#hzt-brand-checks');
  const again=root.querySelector('#hzt-brand-again');
  const button=form.querySelector('button[type="submit"]');
  const API='/api/tools/brand-entity';

  function normalizeUrl(value){
    const clean=value.trim();
    return /^https?:\/\//i.test(clean)?clean:'https://'+clean;
  }

  function escapeHtml(value){
    return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }

  function setProgress(value){
    const rounded=Math.max(0,Math.min(100,Math.round(value)));
    bar.style.width=rounded+'%';
    percent.textContent=rounded+'%';
    steps.forEach((item,index)=>item.classList.toggle('is-active',rounded>=index*24));
  }

  function render(data){
    scoreEl.textContent=Number.isFinite(Number(data.score))?data.score:0;
    titleEl.textContent=data.title||'Проверка завершена';
    copyEl.textContent=data.copy||'Результат сформирован по найденным сигналам сайта.';
    checksEl.innerHTML=(data.checks||[]).map(item=>
      '<article class="hzt__check"><div class="hzt__check-top"><h3>'+escapeHtml(item.label)+'</h3><span class="hzt__badge">'+escapeHtml(item.score)+' · '+escapeHtml(item.state)+'</span></div><p>'+escapeHtml(item.copy)+'</p></article>'
    ).join('');
  }

  function renderError(message){
    scoreEl.textContent='0';
    titleEl.textContent='Проверка не выполнена';
    copyEl.textContent=message||'Не удалось получить данные сайта.';
    checksEl.innerHTML='';
  }

  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(!form.reportValidity())return;
    root.classList.remove('is-done');
    root.classList.add('is-loading');
    button.disabled=true;
    setProgress(0);
    const started=Date.now();
    const progressTimer=setInterval(()=>{
      const elapsed=Date.now()-started;
      setProgress(Math.min(92,(elapsed/10000)*92));
    },120);

    try{
      const url=normalizeUrl(domainInput.value);
      const response=await fetch(API+'?url='+encodeURIComponent(url)+'&brand='+encodeURIComponent(brandInput.value.trim()));
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||'Не удалось проверить сайт');
      const remaining=Math.max(0,10000-(Date.now()-started));
      if(remaining)await new Promise(resolve=>setTimeout(resolve,remaining));
      clearInterval(progressTimer);
      setProgress(100);
      render(data);
    }catch(error){
      const remaining=Math.max(0,10000-(Date.now()-started));
      if(remaining)await new Promise(resolve=>setTimeout(resolve,remaining));
      clearInterval(progressTimer);
      setProgress(100);
      renderError(error.message);
    }finally{
      button.disabled=false;
      root.classList.remove('is-loading');
      root.classList.add('is-done');
      root.scrollIntoView({behavior:'smooth',block:'start'});
    }
  });

  again.addEventListener('click',()=>{
    root.classList.remove('is-done');
    brandInput.focus();
    root.scrollIntoView({behavior:'smooth',block:'start'});
  });
})();
