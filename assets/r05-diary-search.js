'use strict';
// Dedicated search entry; do not alter the reader's saved position or settings.
(() => {
 if (new URLSearchParams(location.search).get('view') !== 'search') return;
 const focusSearch = () => {
  const input = document.getElementById('query');
  if (input) { input.focus({preventScroll:true});input.scrollIntoView({block:'center'}); }
 };
 if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',focusSearch,{once:true});
 else focusSearch();
})();
