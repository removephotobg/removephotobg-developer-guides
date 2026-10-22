/* global document, location, URLSearchParams */
const input=document.querySelector('#q');
const cards=[...document.querySelectorAll('[data-search]')];
function filter(){
 const q=input.value.toLowerCase().trim();
 for(const card of cards)card.hidden=!!q&&!card.dataset.search.includes(q);
 const status=document.querySelector('#search-status');
 if(status)status.textContent=cards.filter(c=>!c.hidden).length+' guides'+(q?' matching your search':'');
}
if(input&&document.querySelector('#search-status')){
 input.value=new URLSearchParams(location.search).get('q')??'';
 input.addEventListener('input',filter);
 filter();
}
