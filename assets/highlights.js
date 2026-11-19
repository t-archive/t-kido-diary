'use strict';

const sections = [...document.querySelectorAll('.feature-section')];
const links = [...document.querySelectorAll('.feature-index a')];

function selectCategory(focusHeading = false) {
  const chosen = sections.find(section => '#' + section.id === location.hash) || sections[0];
  for (const section of sections) section.hidden = section !== chosen;
  for (const link of links) {
    if (link.hash === '#' + chosen.id) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
  if (focusHeading) {
    const heading = chosen.querySelector('h2');
    heading.focus({preventScroll:true});
    heading.scrollIntoView({block:'start'});
  }
}

for (const link of links) {
  link.addEventListener('click', event => {
    if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    if (location.hash !== link.hash) history.pushState(null, '', link.hash);
    selectCategory(true);
  });
}
window.addEventListener('popstate', () => selectCategory());
window.addEventListener('hashchange', () => selectCategory());
selectCategory();

// Native named details are exclusive. This also supports browsers lacking that behavior.
for (const group of document.querySelectorAll('.feature-days')) {
  group.addEventListener('toggle', event => {
    const day = event.target;
    if (day.parentElement !== group || !day.open) return;
    for (const sibling of group.children) {
      if (sibling !== day) sibling.open = false;
    }
  }, true);
}

for (const button of document.querySelectorAll('.feature-inline-toggle')) {
  button.addEventListener('click', () => {
    const note = button.nextElementSibling;
    note.hidden = !note.hidden;
    button.setAttribute('aria-expanded', String(!note.hidden));
  });
}
