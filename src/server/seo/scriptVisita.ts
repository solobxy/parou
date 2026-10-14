// Aviso anónimo de que uma página pública do site (linha, paragem, greve, cidade…) foi aberta.
// Estas páginas não carregam a app, por isso sem isto quem chega pelo Google a uma delas nunca aparecia nas contas.
// Faz o mesmo que a app (ver src/services/estatisticas.ts e src/server/estatisticas.ts): o servidor conta cada
// pessoa uma só vez por dia. Aqui, no máximo um aviso de 30 em 30 minutos (e um por dia novo), para navegar
// de página em página não contar como várias aberturas.
export function scriptVisita(idioma: string): string {
  return `(function(){try{
if(navigator.webdriver)return;
var K='parou_visita_pagina',MS=1800000,D='';
try{D=new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Lisbon'})}catch(x){}
try{var g=(localStorage.getItem(K)||'').split('|');if(g[1]===D&&Date.now()-(+g[0]||0)<MS)return}catch(x){}
var o='site';
try{if(document.referrer.indexOf('android-app://')===0)o='android';else if((window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true)o='instalada'}catch(x){}
var feito=false;
function avisar(){
if(feito||document.visibilityState!=='visible')return;
feito=true;
try{localStorage.setItem(K,Date.now()+'|'+D)}catch(x){}
try{fetch('/api/estatisticas/visita',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({o:o,i:${JSON.stringify(idioma)},e:'pagina'}),credentials:'same-origin',keepalive:true}).catch(function(){})}catch(x){}
}
avisar();
if(!feito)document.addEventListener('visibilitychange',avisar);
}catch(x){}})();`;
}
