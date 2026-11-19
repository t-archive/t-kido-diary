const frame = document.getElementById('movement-map');
const statusMessage = document.getElementById('map-loading');
function checkMap() {
  if (frame.contentDocument?.getElementById('map')) statusMessage.hidden = true;
  else statusMessage.textContent = '地図を読み込めませんでした。ページを再読み込みしてください。';
}
frame.addEventListener('load', checkMap);
if (frame.contentDocument?.getElementById('map')) checkMap();
