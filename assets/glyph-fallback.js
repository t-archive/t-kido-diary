/* P04: Historic rare glyph images. Text nodes keep their original Unicode text for searching and copying. */
(()=>{'use strict';
 const map={'㭦':'3b66','𛂎':'1b08e','𢜩':'22729','𬴮':'2cd2e','𩹉':'29e49'};
 const rx=/[㭦𛂎𢜩𬴮𩹉]/gu;
 const ignore=new Set(['SCRIPT','STYLE','TEXTAREA','NOSCRIPT','SVG','TITLE','OPTION','CODE']);
 function convertText(node){
  if(!node||!node.nodeValue||!rx.test(node.nodeValue)) {rx.lastIndex=0;return;}
  rx.lastIndex=0;
  const parent=node.parentElement;
  if(!parent || ignore.has(parent.tagName) || parent.closest('.kido-rare-glyph'))return;
  const txt=node.nodeValue, fragment=document.createDocumentFragment();let cursor=0;
  for(const m of txt.matchAll(rx)){
    if(m.index>cursor)fragment.appendChild(document.createTextNode(txt.slice(cursor,m.index)));
    const el=document.createElement('span');el.className='kido-rare-glyph';el.dataset.cp=map[m[0]];
    el.textContent=m[0];el.setAttribute('title',`原文文字 U+${map[m[0]].toUpperCase()}`);
    fragment.appendChild(el);cursor=m.index+m[0].length;
  }
  if(cursor<txt.length)fragment.appendChild(document.createTextNode(txt.slice(cursor)));
  if(node.parentNode)node.parentNode.replaceChild(fragment,node);
 }
 function scan(node){
  if(!node||!node.isConnected)return;
  if(node.nodeType===3){convertText(node);return;}
  if(node.nodeType!==1 && node.nodeType!==9 && node.nodeType!==11)return;
  if(node.nodeType===1 && (ignore.has(node.tagName) || node.matches('.kido-rare-glyph')))return;
  const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let list=[];
  while(walker.nextNode()){const n=walker.currentNode;if(n.parentElement&&!n.parentElement.closest('.kido-rare-glyph')&&!ignore.has(n.parentElement.tagName))list.push(n);}
  list.forEach(convertText);
 }
 document.addEventListener('DOMContentLoaded',()=>{
  scan(document.body);const obs=new MutationObserver((mutations)=>{
   obs.disconnect();for(const mut of mutations){
     if(mut.type==='characterData')scan(mut.target);
     else for(const node of mut.addedNodes)scan(node);
   }
   obs.observe(document.body,{subtree:true,childList:true,characterData:true});
  });obs.observe(document.body,{subtree:true,childList:true,characterData:true});
 });
})();
