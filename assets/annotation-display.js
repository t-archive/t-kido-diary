/* Display-only spelling for original annotations; stored research records are unchanged. */
(()=>{'use strict';
const normalize = text => text.replace(/マヽ／ママ|ママ／マヽ|マヽ/g,'ママ');
function scan(root){
 const change=node=>{if(!node.parentElement||node.parentElement.closest('script,style,textarea,pre,code'))return;const value=normalize(node.nodeValue);if(value!==node.nodeValue)node.nodeValue=value;};
 if(root.nodeType===3){change(root);return;}
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);while(walker.nextNode())change(walker.currentNode);
}
function start(){scan(document.body);new MutationObserver(changes=>{for(const change of changes){if(change.type==='characterData')scan(change.target);else for(const node of change.addedNodes)scan(node);}}).observe(document.body,{subtree:true,childList:true,characterData:true});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
